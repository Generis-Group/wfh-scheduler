import { redirect } from "next/navigation";

import { ReportHistory } from "@/components/reports/report-history";
import { auth } from "@/lib/auth";
import { withServerTiming } from "@/lib/performance";
import { hasUserRole } from "@/lib/roles";
import { serialize } from "@/lib/serializers";
import { listReportHistory } from "@/lib/services/reports";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: {
    reportId?: string | string[];
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
    redirect(
      hasUserRole(session.user, "REVIEWER") ? "/review" : "/admin/team",
    );
  }

  const targetReportId =
    typeof searchParams?.reportId === "string" && searchParams.reportId
      ? searchParams.reportId
      : null;

  const reports = await withServerTiming(
    "page:reports:data",
    () => listReportHistory(session.user.id, 30, targetReportId),
    { targetReportId },
  );

  return (
    <ReportHistory
      reports={serialize(reports)}
      initialOpenedReportId={targetReportId}
    />
  );
}
