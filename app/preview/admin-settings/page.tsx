import { EmptyReferencePage } from "@/components/reports/empty-reference-page";
import { requirePreviewBypass } from "@/lib/preview";

export default function PreviewAdminSettingsPage() {
  requirePreviewBypass();

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
