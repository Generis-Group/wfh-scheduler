import { redirect } from "next/navigation";

import { CooDashboard } from "@/components/reports/coo-dashboard";
import { auth } from "@/lib/auth";
import { todayDateString } from "@/lib/dates";
import { serialize } from "@/lib/serializers";
import { getDashboardMetrics, listReportsForDate } from "@/lib/services/reports";

export default async function CooPage({
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

  if (session.user.role !== "COO" && session.user.role !== "ADMIN") {
    redirect("/");
  }

  const date = searchParams?.date ?? todayDateString(session.user.timezone);
  const [rows, metrics] = await Promise.all([listReportsForDate(date), getDashboardMetrics(date)]);

  return (
    <CooDashboard
      rows={serialize(rows)}
      metrics={serialize(metrics)}
      date={date}
      userName={session.user.name ?? session.user.email}
      userRole={session.user.role === "ADMIN" ? "Admin" : "Reviewer"}
    />
  );
}
