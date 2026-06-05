import { redirect } from "next/navigation";

import { AdminReportsManager } from "@/components/admin/admin-reports-manager";
import { AdminSectionFrame } from "@/components/admin/admin-section-frame";
import { auth } from "@/lib/auth";
import { withServerTiming } from "@/lib/performance";
import { hasUserRole } from "@/lib/roles";
import { serialize } from "@/lib/serializers";
import { listReportsForAdminManagement } from "@/lib/services/reports";

export default async function AdminReportsPage() {
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

  if (!hasUserRole(session.user, "ADMIN")) {
    redirect("/");
  }

  const reports = await withServerTiming(
    "page:admin:reports:data",
    () => listReportsForAdminManagement(),
  );

  return (
    <AdminSectionFrame activeSection="reports">
      <AdminReportsManager
        initialReports={serialize(reports.reports)}
        initialTotalCount={reports.totalCount}
      />
    </AdminSectionFrame>
  );
}
