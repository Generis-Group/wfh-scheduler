import { AdminUsers } from "@/components/admin/admin-users";
import { ReferenceAppShell } from "@/components/reports/reference-shell";
import { requirePreviewBypass } from "@/lib/preview";

export default function PreviewEmployeesPage() {
  requirePreviewBypass();

  return (
    <ReferenceAppShell
      active="employees"
      variant="admin"
      userName="Admin Preview"
      userEmail="admin.preview@generisgp.com"
      userRole="Reviewer"
      userStatus="Preview"
      timezone="America/Toronto"
      preview
    >
      <AdminUsers
        isPreview
        initialUsers={[
          {
            id: "preview-user-1",
            name: "Employee Preview",
            email: "employee.preview@generisgp.com",
            role: "EMPLOYEE",
            status: "ACTIVE",
            timezone: "America/Toronto"
          },
          {
            id: "preview-user-2",
            name: "Reviewer Preview",
            email: "reviewer.preview@generisgp.com",
            role: "REVIEWER",
            status: "ACTIVE",
            timezone: "America/Toronto"
          }
        ]}
        initialSettings={{
          jiraProjectKeys: ["GEN"]
        }}
      />
    </ReferenceAppShell>
  );
}
