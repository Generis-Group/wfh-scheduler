import { redirect } from "next/navigation";

import { SettingsPanel } from "@/components/settings/settings-panel";
import { auth } from "@/lib/auth";
import { getGoogleServices } from "@/lib/integrations/google";
import { listJiraResources } from "@/lib/integrations/jira";
import { getOAuthProviderConfig } from "@/lib/oauth-config";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serializers";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.status === "DISABLED") {
    redirect("/api/auth/signout?callbackUrl=/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  const [settings, accounts] = await Promise.all([
    prisma.userIntegrationSettings.upsert({
      where: { userId: session.user.id },
      update: {},
      create: { userId: session.user.id, googleTaskListIds: [] }
    }),
    prisma.account.findMany({
      where: { userId: session.user.id },
      select: { provider: true }
    })
  ]);

  const connected = {
    google: accounts.some((account) => account.provider === "google"),
    atlassian: accounts.some((account) => account.provider === "atlassian")
  };
  const oauthConfig = getOAuthProviderConfig();

  const jiraResources = connected.atlassian
    ? await listJiraResources(session.user.id).catch(() => [])
    : [];
  const taskLists = connected.google
    ? await getGoogleServices(session.user.id)
        .then((services) => services.tasks.tasklists.list({ maxResults: 100 }))
        .then((response) =>
          (response.data.items ?? [])
            .filter((item) => item.id)
            .map((item) => ({ id: item.id!, title: item.title ?? "Untitled task list" }))
        )
        .catch(() => [])
    : [];

  return (
    <SettingsPanel
      connected={connected}
      oauthConfig={oauthConfig}
      initialSettings={serialize(settings)}
      jiraResources={serialize(jiraResources)}
      taskLists={serialize(taskLists)}
    />
  );
}
