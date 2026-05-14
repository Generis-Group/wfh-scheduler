import { EmptyReferencePage } from "@/components/reports/empty-reference-page";

export default function PreviewAdminSettingsPage() {
  return (
    <EmptyReferencePage
      preview
      active="settings"
      variant="admin"
      title="Settings"
      description="Admin review settings will appear here once configuration is connected."
      userName="Admin Preview"
      userRole="Reviewer"
    />
  );
}
