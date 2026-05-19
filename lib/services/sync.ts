import type { SyncProvider } from "@prisma/client";
import type { calendar_v3, tasks_v1 } from "googleapis";

import { parseReportDate, reportDateString, zonedDayRange } from "@/lib/dates";
import { getGoogleServices } from "@/lib/integrations/google";
import { getJiraConnection } from "@/lib/integrations/jira";
import {
  normalizeCalendarEvent,
  normalizeGoogleTask,
  normalizeJiraChangelog,
  normalizeJiraIssue,
  normalizeJiraWorklog,
  type NormalizedActivity
} from "@/lib/normalizers";
import { prisma } from "@/lib/prisma";
import { upsertImportedActivities } from "@/lib/services/activity";

type JiraIssue = {
  id: string;
  key: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    updated?: string;
    assignee?: { accountId?: string; displayName?: string };
    reporter?: { accountId?: string; displayName?: string };
  };
};

type JiraSearchResponse = {
  issues?: JiraIssue[];
  nextPageToken?: string;
};

type JiraUser = {
  accountId: string;
  displayName: string;
};

type JiraWorklogResponse = {
  startAt?: number;
  maxResults?: number;
  total?: number;
  worklogs?: Array<{
    id: string;
    started?: string;
    timeSpentSeconds?: number;
    comment?: unknown;
    author?: { accountId?: string; displayName?: string };
  }>;
};

type JiraChangelogResponse = {
  startAt?: number;
  maxResults?: number;
  total?: number;
  values?: Array<{
    id: string;
    created?: string;
    author?: { accountId?: string; displayName?: string };
    items?: Array<{ field?: string; fromString?: string; toString?: string }>;
  }>;
};

type JiraConnection = Awaited<ReturnType<typeof getJiraConnection>>;
type GoogleCalendarService = calendar_v3.Calendar;
type GoogleCalendarEventListParams = Omit<calendar_v3.Params$Resource$Events$List, "calendarId">;
type GoogleTasksService = tasks_v1.Tasks;
type GoogleTaskListParams = Omit<tasks_v1.Params$Resource$Tasks$List, "tasklist">;
type SyncResult = {
  importedCount: number;
  skippedCount: number;
  staleCount: number;
};

function isInRange(date: Date | null | undefined, start: Date, end: Date) {
  return Boolean(date && date >= start && date <= end);
}

function nextDateString(dateString: string) {
  const date = parseReportDate(dateString);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function listAllGoogleTaskLists(tasks: GoogleTasksService) {
  const taskLists: tasks_v1.Schema$TaskList[] = [];
  let pageToken: string | undefined;

  do {
    const response = await tasks.tasklists.list({ maxResults: 100, pageToken });
    taskLists.push(...(response.data.items ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return taskLists;
}

async function listGoogleCalendarEvents(
  calendar: GoogleCalendarService,
  calendarId: string,
  params: GoogleCalendarEventListParams
) {
  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;

  do {
    const response = await calendar.events.list({
      calendarId,
      maxResults: 2500,
      ...params,
      pageToken
    });
    events.push(...(response.data.items ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}

async function listGoogleTasks(tasks: GoogleTasksService, taskListId: string, params: GoogleTaskListParams) {
  const items: tasks_v1.Schema$Task[] = [];
  let pageToken: string | undefined;

  do {
    const response = await tasks.tasks.list({
      tasklist: taskListId,
      maxResults: 100,
      showCompleted: true,
      showHidden: true,
      showDeleted: false,
      ...params,
      pageToken
    });
    items.push(...(response.data.items ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return items;
}

async function listGoogleTasksForDate(tasks: GoogleTasksService, taskListId: string, start: Date, end: Date) {
  const taskMap = new Map<string, tasks_v1.Schema$Task>();
  const queryGroups: GoogleTaskListParams[] = [
    {
      completedMin: start.toISOString(),
      completedMax: end.toISOString()
    },
    {
      dueMin: start.toISOString(),
      dueMax: end.toISOString()
    },
    {
      updatedMin: start.toISOString()
    }
  ];

  for (const params of queryGroups) {
    for (const task of await listGoogleTasks(tasks, taskListId, params)) {
      if (task.id) {
        taskMap.set(task.id, task);
      }
    }
  }

  return [...taskMap.values()];
}

async function searchAllJiraIssues(jira: JiraConnection, input: { jql: string; fields: string[] }) {
  const issues: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  do {
    const search = await jira.fetch<JiraSearchResponse>("/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        maxResults: 100,
        nextPageToken
      })
    });
    issues.push(...(search.issues ?? []));
    nextPageToken = search.nextPageToken ?? undefined;
  } while (nextPageToken);

  return issues;
}

async function listJiraWorklogs(jira: JiraConnection, issueKey: string, start: Date, end: Date) {
  const worklogs: NonNullable<JiraWorklogResponse["worklogs"]> = [];
  let startAt = 0;
  let total = 0;

  do {
    const response = await jira.fetch<JiraWorklogResponse>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog?startedAfter=${start.getTime()}&startedBefore=${end.getTime()}&startAt=${startAt}&maxResults=100`
    );
    const page = response.worklogs ?? [];
    worklogs.push(...page);
    total = response.total ?? worklogs.length;
    startAt = (response.startAt ?? startAt) + Math.max(response.maxResults ?? page.length, page.length, 1);
  } while (startAt < total);

  return worklogs;
}

async function listJiraChangelog(jira: JiraConnection, issueKey: string) {
  const values: NonNullable<JiraChangelogResponse["values"]> = [];
  let startAt = 0;
  let total = 0;

  do {
    const response = await jira.fetch<JiraChangelogResponse>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?startAt=${startAt}&maxResults=100`
    );
    const page = response.values ?? [];
    values.push(...page);
    total = response.total ?? values.length;
    startAt = (response.startAt ?? startAt) + Math.max(response.maxResults ?? page.length, page.length, 1);
  } while (startAt < total);

  return values;
}

async function getJiraProjectFilter() {
  const setting = await prisma.appSetting.findUnique({ where: { key: "company" } });
  const value = setting?.value as { jiraProjectKeys?: unknown } | undefined;
  const keys = Array.isArray(value?.jiraProjectKeys)
    ? (value.jiraProjectKeys as unknown[]).filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  return keys.map((key) => key.trim().toUpperCase());
}

async function runSync(
  provider: SyncProvider,
  userId: string,
  dateString: string,
  callback: () => Promise<SyncResult>
) {
  const reportDate = parseReportDate(dateString);
  const syncRun = await prisma.syncRun.create({
    data: {
      userId,
      provider,
      rangeStart: reportDate,
      rangeEnd: reportDate,
      status: "RUNNING"
    }
  });

  try {
    const result = await callback();

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "SUCCEEDED",
        importedCount: result.importedCount,
        skippedCount: result.skippedCount,
        completedAt: new Date()
      }
    });

    return result;
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown sync error.",
        completedAt: new Date()
      }
    });

    throw error;
  }
}

export async function syncJira(userId: string, dateString: string, timezone: string) {
  return runSync("JIRA", userId, dateString, async () => {
    const { start, end } = zonedDayRange(dateString, timezone);
    const jira = await getJiraConnection(userId);
    const myself = await jira.fetch<JiraUser>("/rest/api/3/myself");

    await prisma.userIntegrationSettings.upsert({
      where: { userId },
      update: { jiraAccountId: myself.accountId },
      create: { userId, jiraAccountId: myself.accountId, jiraCloudId: jira.resource.id, googleTaskListIds: [] }
    });

    const projectKeys = await getJiraProjectFilter();
    const jql = `${[
      projectKeys.length ? `project in (${projectKeys.map((key) => `"${key.replace(/"/g, '\\"')}"`).join(", ")})` : null,
      `updated >= "${dateString}"`,
      `updated < "${nextDateString(dateString)}"`,
      "(assignee = currentUser() OR reporter = currentUser() OR worklogAuthor = currentUser())"
    ].filter(Boolean).join(" AND ")} ORDER BY updated ASC`;

    const issues = await searchAllJiraIssues(jira, {
      jql,
      fields: ["summary", "status", "updated", "assignee", "reporter"]
    });

    const activities: NormalizedActivity[] = [];

    for (const issue of issues) {
      activities.push(normalizeJiraIssue(issue, jira.resource.url));

      for (const worklog of await listJiraWorklogs(jira, issue.key, start, end)) {
        if (worklog.author?.accountId === myself.accountId) {
          activities.push(normalizeJiraWorklog(issue, worklog, jira.resource.url));
        }
      }

      for (const history of await listJiraChangelog(jira, issue.key)) {
        const changedAt = history.created ? new Date(history.created) : null;

        if (history.author?.accountId === myself.accountId && isInRange(changedAt, start, end)) {
          const normalized = normalizeJiraChangelog(issue, history, jira.resource.url);

          if (normalized) {
            activities.push(normalized);
          }
        }
      }
    }

    return upsertImportedActivities("JIRA", userId, dateString, activities);
  });
}

export async function syncGoogleCalendar(userId: string, dateString: string, timezone: string) {
  return runSync("GOOGLE_CALENDAR", userId, dateString, async () => {
    const { start, end } = zonedDayRange(dateString, timezone);
    const services = await getGoogleServices(userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const settings = await prisma.userIntegrationSettings.upsert({
      where: { userId },
      update: {},
      create: { userId, googleTaskListIds: [] }
    });

    const events = await listGoogleCalendarEvents(services.calendar, settings.googleCalendarId || "primary", {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime"
    });

    const activities = events
      .map((event) => normalizeCalendarEvent(event, user?.email))
      .filter((item): item is NormalizedActivity => Boolean(item));

    return upsertImportedActivities("GOOGLE_CALENDAR", userId, dateString, activities);
  });
}

export async function syncGoogleTasks(userId: string, dateString: string, timezone: string) {
  return runSync("GOOGLE_TASKS", userId, dateString, async () => {
    const { start, end } = zonedDayRange(dateString, timezone);
    const services = await getGoogleServices(userId);
    const settings = await prisma.userIntegrationSettings.upsert({
      where: { userId },
      update: {},
      create: { userId, googleTaskListIds: [] }
    });
    const taskLists = await listAllGoogleTaskLists(services.tasks);
    const selectedListIds =
      settings.googleTaskListIds.length > 0
        ? new Set(settings.googleTaskListIds)
        : new Set(taskLists.map((list) => list.id).filter(Boolean) as string[]);

    const activities: NormalizedActivity[] = [];

    for (const taskList of taskLists) {
      if (!taskList.id || !selectedListIds.has(taskList.id)) {
        continue;
      }

      const tasks = await listGoogleTasksForDate(services.tasks, taskList.id, start, end);

      for (const task of tasks) {
        const normalized = normalizeGoogleTask(task, taskList.id, taskList.title ?? "Google Tasks");

        if (!normalized) {
          continue;
        }

        if (
          isInRange(normalized.startedAt, start, end) ||
          isInRange(normalized.endedAt, start, end) ||
          reportDateString(normalized.startedAt ?? start, timezone) === dateString
        ) {
          activities.push(normalized);
        }
      }
    }

    return upsertImportedActivities("GOOGLE_TASKS", userId, dateString, activities);
  });
}
