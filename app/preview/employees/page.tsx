import { AdminUsers } from "@/components/admin/admin-users";
import { ReferenceAppShell } from "@/components/reports/reference-shell";
import { requirePreviewBypass } from "@/lib/preview";

export default function PreviewEmployeesPage() {
  requirePreviewBypass();

  const departments = [
    { id: "preview-department-1", name: "Operations", slug: "operations" },
    { id: "preview-department-2", name: "Sales", slug: "sales" }
  ];

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
        initialDepartments={departments}
        initialUsers={[
          {
            id: "preview-user-1",
            name: "Employee Preview",
            email: "employee.preview@generisgp.com",
            role: "EMPLOYEE",
            status: "ACTIVE",
            timezone: "America/Toronto",
            reviewerAllDepartments: false,
            departments: [{ departmentId: departments[0].id, department: departments[0] }]
          },
          {
            id: "preview-user-2",
            name: "Reviewer Preview",
            email: "reviewer.preview@generisgp.com",
            role: "REVIEWER",
            status: "ACTIVE",
            timezone: "America/Toronto",
            reviewerAllDepartments: false,
            departments: [{ departmentId: departments[0].id, department: departments[0] }]
          }
        ]}
        initialSettings={{
          jiraProjectKeys: ["GEN"]
        }}
      />
    </ReferenceAppShell>
  );
}
