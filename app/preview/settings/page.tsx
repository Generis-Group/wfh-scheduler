import { EmptyReferencePage } from "@/components/reports/empty-reference-page";
import { requirePreviewBypass } from "@/lib/preview";

export default function PreviewSettingsPage() {
  requirePreviewBypass();

  return (
    <EmptyReferencePage
      preview
      active="settings"
      variant="employee"
      title="Settings"
      description="Integration and account settings will appear here once configuration is connected."
      userName="Employee Preview"
      userRole="Employee"
    />
  );
}
