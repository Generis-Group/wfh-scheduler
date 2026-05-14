import { google } from "googleapis";

import { getOptionalEnv } from "@/lib/env";
import { getProviderAccount } from "@/lib/integrations/provider-accounts";

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

  return client;
}

export async function getGoogleServices(userId: string) {
  const auth = await getGoogleClient(userId);

  return {
    calendar: google.calendar({ version: "v3", auth }),
    tasks: google.tasks({ version: "v1", auth })
  };
}
