import { ReferenceAppShell } from "@/components/reports/reference-shell";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { requirePreviewBypass } from "@/lib/preview";

export default function PreviewSettingsPage() {
  requirePreviewBypass();

  return (
    <ReferenceAppShell
      active="settings"
      variant="employee"
      userName="Employee Preview"
      userEmail="employee.preview@generisgp.com"
      userRole="Employee"
      userStatus="Preview"
      timezone="America/Toronto"
      preview
    >
      <SettingsPanel
        isPreview
        connected={{ google: false, atlassian: false }}
        oauthConfig={{ google: true, atlassian: true }}
        initialSettings={{ jiraCloudId: null, googleCalendarId: "primary", googleTaskListIds: [] }}
        jiraResources={[]}
        taskLists={[]}
        viewerKind="employee"
      />
    </ReferenceAppShell>
  );
}
