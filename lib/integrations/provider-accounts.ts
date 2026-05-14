import type { Account } from "@prisma/client";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getOptionalEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type Provider = "google" | "atlassian";

type RefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  id_token?: string;
};

function isExpiring(account: Account) {
  return Boolean(account.expires_at && account.expires_at <= Math.floor(Date.now() / 1000) + 120);
}

function providerTokenEndpoint(provider: Provider) {
  return provider === "google" ? "https://oauth2.googleapis.com/token" : "https://auth.atlassian.com/oauth/token";
}

function providerClientEnv(provider: Provider) {
  return provider === "google"
    ? { clientId: "GOOGLE_CLIENT_ID", clientSecret: "GOOGLE_CLIENT_SECRET" }
    : { clientId: "ATLASSIAN_CLIENT_ID", clientSecret: "ATLASSIAN_CLIENT_SECRET" };
}

async function refreshProviderAccount(account: Account, provider: Provider) {
  const refreshToken = decryptSecret(account.refresh_token);

  if (!refreshToken) {
    throw new HttpError(409, `Reconnect ${provider}; no refresh token is available.`);
  }

  const env = providerClientEnv(provider);
  const clientId = getOptionalEnv(env.clientId);
  const clientSecret = getOptionalEnv(env.clientSecret);

  if (!clientId || !clientSecret) {
    throw new HttpError(500, `${provider} OAuth is not configured.`);
  }

  const refreshBody = {
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  };
  const response = await fetch(providerTokenEndpoint(provider), {
    method: "POST",
    headers: { "Content-Type": provider === "google" ? "application/x-www-form-urlencoded" : "application/json" },
    body: provider === "google"
      ? new URLSearchParams(refreshBody).toString()
      : JSON.stringify(refreshBody)
  });

  if (!response.ok) {
    throw new HttpError(409, `Reconnect ${provider}; token refresh failed.`);
  }

  const data = (await response.json()) as RefreshResponse;

  if (!data.access_token) {
    throw new HttpError(409, `Reconnect ${provider}; token refresh did not return an access token.`);
  }

  return prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: encryptSecret(data.access_token),
      refresh_token: encryptSecret(data.refresh_token ?? refreshToken),
      expires_at: data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : account.expires_at,
      token_type: data.token_type ?? account.token_type,
      scope: data.scope ?? account.scope,
      id_token: encryptSecret(data.id_token) ?? account.id_token
    }
  });
}

export async function getProviderAccount(userId: string, provider: "google" | "atlassian") {
  let account = await prisma.account.findFirst({
    where: { userId, provider }
  });

  if (!account?.access_token) {
    throw new HttpError(409, `Connect ${provider} before syncing.`);
  }

  if (isExpiring(account)) {
    account = await refreshProviderAccount(account, provider);
  }

  return {
    ...account,
    accessToken: decryptSecret(account.access_token),
    refreshToken: decryptSecret(account.refresh_token),
    idToken: decryptSecret(account.id_token)
  };
}
