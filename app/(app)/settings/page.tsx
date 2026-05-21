import { redirect } from "next/navigation";

import { SettingsPanel } from "@/components/settings/settings-panel";
import { auth } from "@/lib/auth";
import { getOAuthProviderConfig } from "@/lib/oauth-config";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serializers";
import { getCompanySettings } from "@/lib/services/company-settings";
import {
  getLastReviewDigestRun,
  getReviewDigestEmailStatus,
} from "@/lib/services/email-digest";

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

  const isReviewer =
    session.user.role === "REVIEWER" || session.user.role === "ADMIN";
  const [settings, accounts, companySetting, lastEmailRun] = await Promise.all([
    prisma.userIntegrationSettings.upsert({
      where: { userId: session.user.id },
      update: {},
      create: { userId: session.user.id, googleTaskListIds: [] },
    }),
    prisma.account.findMany({
      where: { userId: session.user.id },
      select: { provider: true },
    }),
    isReviewer
      ? getCompanySettings()
      : Promise.resolve({ jiraProjectKeys: [] }),
    isReviewer ? getLastReviewDigestRun() : Promise.resolve(null),
  ]);

  const connected = {
    google: accounts.some((account) => account.provider === "google"),
    atlassian: accounts.some((account) => account.provider === "atlassian"),
  };
  const oauthConfig = getOAuthProviderConfig();

  return (
    <SettingsPanel
      connected={connected}
      oauthConfig={oauthConfig}
      initialSettings={serialize(settings)}
      companySettings={companySetting}
      canManageCompanySettings={session.user.role === "ADMIN"}
      viewerKind={isReviewer ? "admin" : "employee"}
      emailStatus={isReviewer ? getReviewDigestEmailStatus() : undefined}
      lastEmailRun={serialize(lastEmailRun)}
    />
  );
}
