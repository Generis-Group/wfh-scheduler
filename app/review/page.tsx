import { redirect } from "next/navigation";

import { ReviewerDashboard } from "@/components/reports/reviewer-dashboard";
import { auth } from "@/lib/auth";
import { todayDateString } from "@/lib/dates";
import { serialize } from "@/lib/serializers";
import { getDashboardMetrics, listReportsForDate } from "@/lib/services/reports";

export default async function ReviewPage({
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

  if (session.user.role !== "REVIEWER" && session.user.role !== "ADMIN") {
    redirect("/");
  }

  const date = searchParams?.date ?? todayDateString(session.user.timezone);
  const [rows, metrics] = await Promise.all([listReportsForDate(date), getDashboardMetrics(date)]);

  return (
    <ReviewerDashboard
      rows={serialize(rows)}
      metrics={serialize(metrics)}
      date={date}
      userName={session.user.name ?? session.user.email}
      userEmail={session.user.email}
      userRole={session.user.role === "ADMIN" ? "Admin" : "Reviewer"}
      userStatus={session.user.status}
      timezone={session.user.timezone}
      mustChangePassword={session.user.mustChangePassword}
      reviewerId={session.user.id}
    />
  );
}
