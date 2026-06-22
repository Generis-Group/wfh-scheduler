import { redirect } from "next/navigation";

import { DailyReportApp } from "@/components/reports/daily-report-app";
import { auth } from "@/lib/auth";
import { clampReportDateToToday } from "@/lib/dates";
import { withServerTiming } from "@/lib/performance";
import { prisma } from "@/lib/prisma";
import { hasUserRole } from "@/lib/roles";
import { serialize } from "@/lib/serializers";
import {
  getDailyReportEditorData,
  reportWorkWeekRange,
} from "@/lib/services/reports";
import { listPlannedWorkLocations } from "@/lib/services/work-location-plans";
import type { WorkLocationValue } from "@/lib/work-locations";

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
    redirect(hasUserRole(session.user, "REVIEWER") ? "/review" : "/admin/team");
  }

  const requestedDate = searchParams?.date;
  const date = clampReportDateToToday(requestedDate);

  if (requestedDate && requestedDate !== date) {
    redirect(`/?date=${date}`);
  }

  const { start: weekStart, end: weekEnd } = reportWorkWeekRange(date);
  const [{ report, activities }, accounts, weeklyPlannedLocations] =
    await withServerTiming(
      "page:daily:data",
      () =>
        Promise.all([
          getDailyReportEditorData(session.user.id, date),
          prisma.account.findMany({
            where: { userId: session.user.id },
            select: { provider: true },
          }),
          listPlannedWorkLocations(session.user.id, weekStart, weekEnd),
        ]),
      { date },
    );
  const plannedLocation =
    weeklyPlannedLocations.find(
      (plan: { date: string; workLocation: WorkLocationValue }) =>
        plan.date === date,
    )?.workLocation ??
    null;

  const initialReport = report
    ? serialize({ ...report, activities })
    : {
        id: "",
        reportDate: date,
        workLocation: plannedLocation ?? ("UNKNOWN" as const),
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
        google: accounts.some(
          (account: { provider: string }) => account.provider === "google",
        ),
        atlassian: accounts.some(
          (account: { provider: string }) => account.provider === "atlassian",
        ),
      }}
      weeklyPlannedLocations={serialize(weeklyPlannedLocations)}
    />
  );
}
