import { google } from "googleapis";

import { encryptSecret } from "@/lib/crypto";
import { getOptionalEnv } from "@/lib/env";
import { getProviderAccount } from "@/lib/integrations/provider-accounts";
import { prisma } from "@/lib/prisma";

export async function getGoogleClient(userId: string) {
  const account = await getProviderAccount(userId, "google");
  const client = new google.auth.OAuth2(
    getOptionalEnv("GOOGLE_CLIENT_ID"),
    getOptionalEnv("GOOGLE_CLIENT_SECRET")
  );

  client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken ?? undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined
  });
  client.on("tokens", async (tokens) => {
    await prisma.account.updateMany({
      where: { userId, provider: "google" },
      data: {
        access_token: encryptSecret(tokens.access_token) ?? undefined,
        refresh_token: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : undefined,
        expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : undefined,
        id_token: tokens.id_token ? encryptSecret(tokens.id_token) : undefined
      }
    });
  });

  return client;
}

export async function getGoogleServices(userId: string) {
  const auth = await getGoogleClient(userId);

  return {
    calendar: google.calendar({ version: "v3", auth }),
    tasks: google.tasks({ version: "v1", auth })
  };
}
