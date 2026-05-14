import { EmptyReferencePage } from "@/components/reports/empty-reference-page";
import { requirePreviewBypass } from "@/lib/preview";

export default function PreviewEmployeesPage() {
  requirePreviewBypass();

  return (
    <EmptyReferencePage
      preview
      active="employees"
      variant="admin"
      title="Employees"
      description="Employee management will appear here once the database-backed account system is connected."
      userName="Admin Preview"
      userRole="Reviewer"
    />
  );
}
