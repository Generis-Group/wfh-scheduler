import { redirect } from "next/navigation";

import { DailyReportApp } from "@/components/reports/daily-report-app";
import { auth } from "@/lib/auth";
import { todayDateString } from "@/lib/dates";
import { serialize } from "@/lib/serializers";
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

  if (session.user.role === "COO" || session.user.role === "ADMIN") {
    redirect("/coo");
  }

  const date = searchParams?.date ?? todayDateString(session.user.timezone);
  const report = await getDailyReport(session.user.id, date);

  if (!report) {
    throw new Error("Unable to create daily report.");
  }

  return (
    <DailyReportApp
      initialReport={serialize(report)}
      date={date}
      userName={session.user.name ?? session.user.email}
      userRole="Employee"
    />
  );
}
