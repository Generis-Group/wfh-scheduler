import { redirect } from "next/navigation";
import type { tasks_v1 } from "googleapis";

import { ReferenceAppShell } from "@/components/reports/reference-shell";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { auth } from "@/lib/auth";
import { getGoogleServices } from "@/lib/integrations/google";
import { listJiraResources } from "@/lib/integrations/jira";
import { getOAuthProviderConfig } from "@/lib/oauth-config";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serializers";
import { getLastReviewDigestRun, getReviewDigestEmailStatus } from "@/lib/services/email-digest";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load provider settings.";
}

async function listAllGoogleTaskLists(tasks: tasks_v1.Tasks) {
  const taskLists: tasks_v1.Schema$TaskList[] = [];
  let pageToken: string | undefined;

  do {
    const response = await tasks.tasklists.list({ maxResults: 100, pageToken });
    taskLists.push(...(response.data.items ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return taskLists;
}

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

  const isReviewer = session.user.role === "REVIEWER" || session.user.role === "ADMIN";
  const [settings, accounts, companySetting, lastEmailRun] = await Promise.all([
    prisma.userIntegrationSettings.upsert({
      where: { userId: session.user.id },
      update: {},
      create: { userId: session.user.id, googleTaskListIds: [] }
    }),
    prisma.account.findMany({
      where: { userId: session.user.id },
      select: { provider: true }
    }),
    isReviewer ? prisma.appSetting.findUnique({ where: { key: "company" } }) : Promise.resolve(null),
    isReviewer ? getLastReviewDigestRun() : Promise.resolve(null)
  ]);

  const connected = {
    google: accounts.some((account) => account.provider === "google"),
    atlassian: accounts.some((account) => account.provider === "atlassian")
  };
  const oauthConfig = getOAuthProviderConfig();
  const providerErrors: { google?: string; atlassian?: string } = {};

  const jiraResources = connected.atlassian
    ? await listJiraResources(session.user.id).catch((error) => {
        providerErrors.atlassian = errorMessage(error);
        return [];
      })
    : [];
  const taskLists = connected.google
    ? await getGoogleServices(session.user.id)
        .then((services) => listAllGoogleTaskLists(services.tasks))
        .then((items) =>
          items
            .filter((item) => item.id)
            .map((item) => ({ id: item.id!, title: item.title ?? "Untitled task list" }))
        )
        .catch((error) => {
          providerErrors.google = errorMessage(error);
          return [];
        })
    : [];

  const rawCompanySettings = companySetting?.value as { jiraProjectKeys?: unknown } | undefined;
  const companySettings = {
    jiraProjectKeys: Array.isArray(rawCompanySettings?.jiraProjectKeys) ? (rawCompanySettings.jiraProjectKeys as string[]) : []
  };

  return (
    <ReferenceAppShell
      active="settings"
      variant={isReviewer ? "admin" : "employee"}
      userName={session.user.name ?? session.user.email}
      userEmail={session.user.email}
      userRole={session.user.role === "ADMIN" ? "Admin" : isReviewer ? "Reviewer" : "Employee"}
      userStatus={session.user.status}
      timezone={session.user.timezone}
      mustChangePassword={session.user.mustChangePassword}
    >
      <SettingsPanel
        connected={connected}
        oauthConfig={oauthConfig}
        initialSettings={serialize(settings)}
        jiraResources={serialize(jiraResources)}
        taskLists={serialize(taskLists)}
        providerErrors={providerErrors}
        companySettings={companySettings}
        canManageCompanySettings={session.user.role === "ADMIN"}
        viewerKind={isReviewer ? "admin" : "employee"}
        emailStatus={isReviewer ? getReviewDigestEmailStatus() : undefined}
        lastEmailRun={serialize(lastEmailRun)}
      />
    </ReferenceAppShell>
  );
}
