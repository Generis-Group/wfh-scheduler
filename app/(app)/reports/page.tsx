import { redirect } from "next/navigation";

import { ReportHistory } from "@/components/reports/report-history";
import { auth } from "@/lib/auth";
import { serialize } from "@/lib/serializers";
import { listReportHistory } from "@/lib/services/reports";

export default async function ReportsPage() {
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

  if (session.user.role !== "EMPLOYEE") {
    redirect("/review");
  }

  const reports = await listReportHistory(session.user.id);

  return (
    <ReportHistory
      reports={serialize(reports)}
      timezone={session.user.timezone}
    />
  );
}
