import { ReferenceAppShell } from "@/components/reports/reference-shell";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { requirePreviewBypass } from "@/lib/preview";

export default function PreviewAdminSettingsPage() {
  requirePreviewBypass();

  return (
    <ReferenceAppShell
      active="settings"
      variant="admin"
      userName="Admin Preview"
      userEmail="admin.preview@generisgp.com"
      userRole="Reviewer"
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
        companySettings={{ jiraProjectKeys: ["GEN"] }}
        canManageCompanySettings
        viewerKind="admin"
        emailStatus={{
          configured: false,
          provider: "Resend",
          from: null,
          digestTime: "6:00 PM America/Toronto",
          recipientRule: "All active reviewers/admins"
        }}
        lastEmailRun={null}
      />
    </ReferenceAppShell>
  );
}
