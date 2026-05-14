import { EmptyReferencePage } from "@/components/reports/empty-reference-page";

export default function PreviewHistoryPage() {
  return (
    <EmptyReferencePage
      preview
      active="history"
      variant="employee"
      title="Report History"
      description="Past daily reports will appear here once report history is connected."
      userName="Employee Preview"
      userRole="Employee"
    />
  );
}
