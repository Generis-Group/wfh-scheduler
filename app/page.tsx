import { redirect } from "next/navigation";

import { DailyReportApp } from "@/components/reports/daily-report-app";
import { auth } from "@/lib/auth";
import { todayDateString } from "@/lib/dates";
import { getOAuthProviderConfig } from "@/lib/oauth-config";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serializers";
import { listActivities } from "@/lib/services/activity";
import { getDailyReport } from "@/lib/services/reports";

export default async function HomePage({
  searchParams
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

  if (session.user.role === "REVIEWER" || session.user.role === "ADMIN") {
    redirect("/review");
  }

  const date = searchParams?.date ?? todayDateString(session.user.timezone);
  const [report, activities, accounts] = await Promise.all([
    getDailyReport(session.user.id, date),
    listActivities(session.user.id, date),
    prisma.account.findMany({
      where: { userId: session.user.id },
      select: { provider: true }
    })
  ]);

  const initialReport = report
    ? serialize({ ...report, activities })
    : {
        id: "",
        reportDate: date,
        workLocation: "UNKNOWN" as const,
        summary: "",
        blockers: "",
        status: "DRAFT" as const,
        submittedAt: null,
        updatedAt: null,
        activities: serialize(activities),
        comments: [],
        revisions: []
      };

  return (
    <DailyReportApp
      initialReport={initialReport}
      date={date}
      userName={session.user.name ?? session.user.email}
      userEmail={session.user.email}
      userRole="Employee"
      userStatus={session.user.status}
      timezone={session.user.timezone}
      mustChangePassword={session.user.mustChangePassword}
      integrationStatus={{
        google: accounts.some((account) => account.provider === "google"),
        atlassian: accounts.some((account) => account.provider === "atlassian")
      }}
      oauthConfig={getOAuthProviderConfig()}
    />
  );
}
