import { redirect } from "next/navigation";

import { SettingsPanel } from "@/components/settings/settings-panel";
import { auth } from "@/lib/auth";
import { getOAuthProviderConfig } from "@/lib/oauth-config";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serializers";
import { getCompanySettings } from "@/lib/services/company-settings";

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

  const canManageCompanySettings = session.user.role === "ADMIN";
  const [settings, accounts, companySetting, user] = await Promise.all([
    prisma.userIntegrationSettings.upsert({
      where: { userId: session.user.id },
      update: {},
      create: { userId: session.user.id, googleTaskListIds: [] },
    }),
    prisma.account.findMany({
      where: { userId: session.user.id },
      select: { provider: true },
    }),
    canManageCompanySettings
      ? getCompanySettings()
      : Promise.resolve({ jiraProjectKeys: [] }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        mustChangePassword: true,
        passwordHash: true,
      },
    }),
  ]);

  if (!user) {
    redirect("/login");
  }

  const connected = {
    google: accounts.some((account) => account.provider === "google"),
    atlassian: accounts.some((account) => account.provider === "atlassian"),
  };
  const oauthConfig = getOAuthProviderConfig();

  return (
    <SettingsPanel
      user={serialize({
        ...user,
        passwordHash: undefined,
        hasPassword: Boolean(user.passwordHash),
      })}
      connected={connected}
      oauthConfig={oauthConfig}
      initialSettings={serialize(settings)}
      companySettings={companySetting}
      canManageCompanySettings={canManageCompanySettings}
    />
  );
}
