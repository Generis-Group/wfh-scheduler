import type { SyncProvider } from "@prisma/client";

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
};

type JiraUser = {
  accountId: string;
  displayName: string;
};

type JiraWorklogResponse = {
  worklogs?: Array<{
    id: string;
    started?: string;
    timeSpentSeconds?: number;
    comment?: unknown;
    author?: { accountId?: string; displayName?: string };
  }>;
};

type JiraChangelogResponse = {
  values?: Array<{
    id: string;
    created?: string;
    author?: { accountId?: string; displayName?: string };
    items?: Array<{ field?: string; fromString?: string; toString?: string }>;
  }>;
};

function isInRange(date: Date | null | undefined, start: Date, end: Date) {
  return Boolean(date && date >= start && date <= end);
}

function nextDateString(dateString: string) {
  const date = parseReportDate(dateString);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
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
  callback: () => Promise<{ importedCount: number; skippedCount: number }>
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

    const search = await jira.fetch<JiraSearchResponse>("/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify({
        jql,
        fields: ["summary", "status", "updated", "assignee", "reporter"],
        maxResults: 100
      })
    });

    const activities: NormalizedActivity[] = [];

    for (const issue of search.issues ?? []) {
      activities.push(normalizeJiraIssue(issue, jira.resource.url));

      const worklogs = await jira.fetch<JiraWorklogResponse>(
        `/rest/api/3/issue/${encodeURIComponent(issue.key)}/worklog?startedAfter=${start.getTime()}&startedBefore=${end.getTime()}`
      );

      for (const worklog of worklogs.worklogs ?? []) {
        if (worklog.author?.accountId === myself.accountId) {
          activities.push(normalizeJiraWorklog(issue, worklog, jira.resource.url));
        }
      }

      const changelog = await jira.fetch<JiraChangelogResponse>(
        `/rest/api/3/issue/${encodeURIComponent(issue.key)}/changelog?maxResults=100`
      );

      for (const history of changelog.values ?? []) {
        const changedAt = history.created ? new Date(history.created) : null;

        if (history.author?.accountId === myself.accountId && isInRange(changedAt, start, end)) {
          const normalized = normalizeJiraChangelog(issue, history, jira.resource.url);

          if (normalized) {
            activities.push(normalized);
          }
        }
      }
    }

    return upsertImportedActivities(userId, dateString, activities);
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

    const events = await services.calendar.events.list({
      calendarId: settings.googleCalendarId || "primary",
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime"
    });

    const activities = (events.data.items ?? [])
      .map((event) => normalizeCalendarEvent(event, user?.email))
      .filter((item): item is NormalizedActivity => Boolean(item));

    return upsertImportedActivities(userId, dateString, activities);
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
    const taskLists = await services.tasks.tasklists.list({ maxResults: 100 });
    const selectedListIds =
      settings.googleTaskListIds.length > 0
        ? new Set(settings.googleTaskListIds)
        : new Set((taskLists.data.items ?? []).map((list) => list.id).filter(Boolean) as string[]);

    const activities: NormalizedActivity[] = [];

    for (const taskList of taskLists.data.items ?? []) {
      if (!taskList.id || !selectedListIds.has(taskList.id)) {
        continue;
      }

      const tasks = await services.tasks.tasks.list({
        tasklist: taskList.id,
        showCompleted: true,
        showHidden: false,
        maxResults: 100
      });

      for (const task of tasks.data.items ?? []) {
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

    return upsertImportedActivities(userId, dateString, activities);
  });
}
