import { HttpError } from "@/lib/http";
import { getProviderAccount } from "@/lib/integrations/provider-accounts";
import { prisma } from "@/lib/prisma";

type AccessibleResource = {
  id: string;
  name: string;
  url: string;
  scopes: string[];
  avatarUrl?: string;
};

async function jiraFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new HttpError(response.status, `Jira request failed: ${body || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function getJiraConnection(userId: string) {
  const account = await getProviderAccount(userId, "atlassian");
  const accessToken = account.accessToken;

  if (!accessToken) {
    throw new HttpError(409, "Connect Atlassian before syncing.");
  }

  const resources = await jiraFetch<AccessibleResource[]>(
    "https://api.atlassian.com/oauth/token/accessible-resources",
    accessToken
  );

  if (resources.length === 0) {
    throw new HttpError(409, "No Jira cloud sites are available for this Atlassian account.");
  }

  const settings = await prisma.userIntegrationSettings.upsert({
    where: { userId },
    update: {},
    create: { userId, googleTaskListIds: [] }
  });

  const resource = resources.find((item) => item.id === settings.jiraCloudId) ?? resources[0];

  if (settings.jiraCloudId !== resource.id) {
    await prisma.userIntegrationSettings.update({
      where: { userId },
      data: { jiraCloudId: resource.id }
    });
  }

  const apiBaseUrl = `https://api.atlassian.com/ex/jira/${resource.id}`;

  return {
    accessToken,
    resource,
    apiBaseUrl,
    fetch: <T>(path: string, init?: RequestInit) => jiraFetch<T>(`${apiBaseUrl}${path}`, accessToken, init)
  };
}

export async function listJiraResources(userId: string) {
  const account = await getProviderAccount(userId, "atlassian");

  if (!account.accessToken) {
    return [];
  }

  return jiraFetch<AccessibleResource[]>(
    "https://api.atlassian.com/oauth/token/accessible-resources",
    account.accessToken
  );
}
