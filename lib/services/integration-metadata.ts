import type { tasks_v1 } from "googleapis";

import { getGoogleServices } from "@/lib/integrations/google";
import { listJiraResources } from "@/lib/integrations/jira";

export type JiraResource = {
  id: string;
  name: string;
  url: string;
};

export type TaskList = {
  id: string;
  title: string;
};

export type IntegrationMetadata = {
  jiraResources: JiraResource[];
  taskLists: TaskList[];
  providerErrors: {
    google?: string;
    atlassian?: string;
  };
};

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to load provider settings.";
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

export async function loadIntegrationMetadata(
  userId: string,
  connected: { google: boolean; atlassian: boolean },
): Promise<IntegrationMetadata> {
  const providerErrors: IntegrationMetadata["providerErrors"] = {};
  const [jiraResources, taskLists] = await Promise.all([
    connected.atlassian
      ? listJiraResources(userId).catch((error) => {
          providerErrors.atlassian = errorMessage(error);
          return [];
        })
      : Promise.resolve([]),
    connected.google
      ? getGoogleServices(userId)
          .then((services) => listAllGoogleTaskLists(services.tasks))
          .then((items) =>
            items
              .filter((item) => item.id)
              .map((item) => ({
                id: item.id!,
                title: item.title ?? "Untitled task list",
              })),
          )
          .catch((error) => {
            providerErrors.google = errorMessage(error);
            return [];
          })
      : Promise.resolve([]),
  ]);

  return { jiraResources, taskLists, providerErrors };
}
