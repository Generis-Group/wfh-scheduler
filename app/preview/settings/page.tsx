import { EmptyReferencePage } from "@/components/reports/empty-reference-page";

export default function PreviewSettingsPage() {
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
