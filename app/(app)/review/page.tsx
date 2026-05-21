import { redirect } from "next/navigation";

import { ReviewerDashboard } from "@/components/reports/reviewer-dashboard";
import { auth } from "@/lib/auth";
import { todayDateString } from "@/lib/dates";
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

  if (session.user.role !== "REVIEWER" && session.user.role !== "ADMIN") {
    redirect("/");
  }

  const date = searchParams?.date ?? todayDateString(session.user.timezone);
  const scope = { userId: session.user.id, role: session.user.role };
  const { rows, metrics } = await getReviewDashboardData(date, scope);

  return (
    <ReviewerDashboard
      rows={serialize(rows)}
      metrics={serialize(metrics)}
      date={date}
      reviewerId={session.user.id}
    />
  );
}
