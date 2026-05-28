import { redirect } from "next/navigation";

import { DailyReportApp } from "@/components/reports/daily-report-app";
import { auth } from "@/lib/auth";
import { clampReportDateToToday } from "@/lib/dates";
import { getOAuthProviderConfig } from "@/lib/oauth-config";
import { prisma } from "@/lib/prisma";
import { hasUserRole } from "@/lib/roles";
import { serialize } from "@/lib/serializers";
import { getDailyReportEditorData } from "@/lib/services/reports";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: {
    date?: string;
  };
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.status === "DISABLED") {
    redirect("/api/auth/signout?callbackUrl=/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  if (!hasUserRole(session.user, "EMPLOYEE")) {
    redirect("/review");
  }

  const requestedDate = searchParams?.date;
  const date = clampReportDateToToday(requestedDate);

  if (requestedDate && requestedDate !== date) {
    redirect(`/?date=${date}`);
  }

  const [{ report, activities }, accounts] = await Promise.all([
    getDailyReportEditorData(session.user.id, date),
    prisma.account.findMany({
      where: { userId: session.user.id },
      select: { provider: true },
    }),
  ]);

  const initialReport = report
    ? serialize({ ...report, activities })
    : {
        id: "",
        reportDate: date,
        workLocation: "UNKNOWN" as const,
        summary: "",
        status: "DRAFT" as const,
        submittedAt: null,
        updatedAt: null,
        activities: serialize(activities),
        comments: [],
        revisions: [],
      };

  return (
    <DailyReportApp
      initialReport={initialReport}
      date={date}
      integrationStatus={{
        google: accounts.some((account) => account.provider === "google"),
        atlassian: accounts.some((account) => account.provider === "atlassian"),
      }}
      oauthConfig={getOAuthProviderConfig()}
    />
  );
}
