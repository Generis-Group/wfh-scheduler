import { redirect } from "next/navigation";

import { ReviewerDashboard } from "@/components/reports/reviewer-dashboard";
import { auth } from "@/lib/auth";
import { clampReportDateToToday } from "@/lib/dates";
import { withServerTiming } from "@/lib/performance";
import { hasUserRole, normalizeUserRoles } from "@/lib/roles";
import { serialize } from "@/lib/serializers";
import { getReviewDashboardData } from "@/lib/services/reports";

export default async function ReviewPage({
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

  if (
    !hasUserRole(session.user, "REVIEWER") &&
    !hasUserRole(session.user, "ADMIN")
  ) {
    redirect("/");
  }

  const requestedDate = searchParams?.date;
  const date = clampReportDateToToday(requestedDate);

  if (requestedDate && requestedDate !== date) {
    redirect(`/review?date=${date}`);
  }

  const scope = {
    userId: session.user.id,
    roles: normalizeUserRoles(session.user),
  };
  const { rows, metrics } = await withServerTiming(
    "page:review:data",
    () => getReviewDashboardData(date, scope),
    { date },
  );

  return (
    <ReviewerDashboard
      rows={serialize(rows)}
      metrics={serialize(metrics)}
      date={date}
      reviewerId={session.user.id}
    />
  );
}
