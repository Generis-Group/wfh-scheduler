import type { ActivityItem, SyncProvider } from "@prisma/client";
import type { calendar_v3, tasks_v1 } from "googleapis";

import {
  DEFAULT_TIMEZONE,
  parseReportDate,
  reportDateString,
  zonedDayRange,
} from "@/lib/dates";
import { getGoogleServices } from "@/lib/integrations/google";
import { getJiraConnection } from "@/lib/integrations/jira";
import {
  normalizeCalendarEvent,
  normalizeGoogleTask,
  normalizeJiraIssueDay,
  type JiraIssueActivityType,
  type JiraIssueDayEvidence,
  type NormalizedActivity
} from "@/lib/normalizers";
import { prisma } from "@/lib/prisma";
import { upsertImportedActivities } from "@/lib/services/activity";
import { getCompanySettings } from "@/lib/services/company-settings";

type JiraIssue = {
  id: string;
  key: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    created?: string;
    updated?: string;
    assignee?: { accountId?: string; displayName?: string };
    creator?: { accountId?: string; displayName?: string };
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

type JiraCommentResponse = {
  startAt?: number;
  maxResults?: number;
  total?: number;
  comments?: Array<{
    id: string;
    created?: string;
    updated?: string;
    body?: unknown;
    author?: { accountId?: string; displayName?: string };
    updateAuthor?: { accountId?: string; displayName?: string };
  }>;
};

type JiraWorklog = NonNullable<JiraWorklogResponse["worklogs"]>[number];
type JiraChangelog = NonNullable<JiraChangelogResponse["values"]>[number];
type JiraComment = NonNullable<JiraCommentResponse["comments"]>[number];
type JiraConnection = Awaited<ReturnType<typeof getJiraConnection>>;
type GoogleCalendarService = calendar_v3.Calendar;
type GoogleCalendarEventListParams = Omit<calendar_v3.Params$Resource$Events$List, "calendarId">;
type GoogleTasksService = tasks_v1.Tasks;
type GoogleTaskListParams = Omit<tasks_v1.Params$Resource$Tasks$List, "tasklist">;
type SyncResult = {
  importedCount: number;
  skippedCount: number;
  staleCount: number;
  activities: ActivityItem[];
};

function isInRange(date: Date | null | undefined, start: Date, end: Date) {
  return Boolean(date && date >= start && date <= end);
}

function nextDateString(dateString: string) {
  const date = parseReportDate(dateString);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function jiraDateLiteral(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function jiraProjectClause(projectKeys: string[]) {
  return projectKeys.length ? `project in (${projectKeys.map(jiraDateLiteral).join(", ")})` : null;
}

function buildJiraJql(clauses: Array<string | null>, orderBy = "updated ASC") {
  return `${clauses.filter(Boolean).join(" AND ")} ORDER BY ${orderBy}`;
}

const meaningfulJiraChangeFields = new Set([
  "status",
  "resolution",
  "assignee",
  "priority",
  "summary",
  "due date",
  "duedate",
  "component",
  "labels",
  "components",
  "fix version",
  "fix versions",
  "fixversion",
  "fixversions",
  "sprint",
  "epic link",
  "parent"
]);
const jiraActivityTypeOrder: JiraIssueActivityType[] = ["comment", "worklog", "changelog", "issue"];

function optionalDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function jiraChangeFieldName(field: string | undefined) {
  const name = field?.trim();

  return name ? name : null;
}

function jiraChangeFieldKey(field: string | undefined) {
  const name = jiraChangeFieldName(field);

  return name
    ?.toLowerCase()
    .replace(/\/s\b/g, "s")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isMeaningfulJiraChangeField(field: string | undefined) {
  const key = jiraChangeFieldKey(field);

  return Boolean(key && meaningfulJiraChangeFields.has(key));
}

function isJiraStatusChangeField(field: string | undefined) {
  return jiraChangeFieldKey(field) === "status";
}

function pushDate(values: Date[], date: Date | null) {
  if (date) {
    values.push(date);
  }
}

function earliestDate(values: Date[]) {
  return values.reduce<Date | null>(
    (earliest, date) => (!earliest || date.getTime() < earliest.getTime() ? date : earliest),
    null
  );
}

function latestDate(values: Date[]) {
  return values.reduce<Date | null>(
    (latest, date) => (!latest || date.getTime() > latest.getTime() ? date : latest),
    null
  );
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
      showAssigned: true,
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

async function listJiraComments(jira: JiraConnection, issueKey: string) {
  const comments: NonNullable<JiraCommentResponse["comments"]> = [];
  let startAt = 0;
  let total = 0;

  do {
    const response = await jira.fetch<JiraCommentResponse>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?startAt=${startAt}&maxResults=100&orderBy=created`
    );
    const page = response.comments ?? [];
    comments.push(...page);
    total = response.total ?? comments.length;
    startAt = (response.startAt ?? startAt) + Math.max(response.maxResults ?? page.length, page.length, 1);
  } while (startAt < total);

  return comments;
}

function buildJiraIssueDayEvidence(
  issue: JiraIssue,
  accountId: string,
  start: Date,
  end: Date,
  worklogs: JiraWorklog[],
  changelog: JiraChangelog[],
  comments: JiraComment[]
): JiraIssueDayEvidence | null {
  const activityTypes = new Set<JiraIssueActivityType>();
  const activityDates: Date[] = [];
  const changedFields = new Set<string>();
  const statusTransitions: NonNullable<JiraIssueDayEvidence["statusTransitions"]> = [];
  let commentCount = 0;
  let worklogCount = 0;
  let durationMinutes = 0;
  const issueCreatedAt = optionalDate(issue.fields?.created);

  if (issue.fields?.creator?.accountId === accountId && isInRange(issueCreatedAt, start, end)) {
    activityTypes.add("issue");
    pushDate(activityDates, issueCreatedAt);
  }

  for (const worklog of worklogs) {
    const startedAt = optionalDate(worklog.started);

    if (worklog.author?.accountId !== accountId || !isInRange(startedAt, start, end)) {
      continue;
    }

    const minutes = worklog.timeSpentSeconds ? Math.round(worklog.timeSpentSeconds / 60) : 0;
    activityTypes.add("worklog");
    worklogCount += 1;
    durationMinutes += minutes;
    pushDate(activityDates, startedAt);

    if (startedAt && minutes > 0) {
      activityDates.push(new Date(startedAt.getTime() + minutes * 60_000));
    }
  }

  for (const history of changelog) {
    const changedAt = optionalDate(history.created);

    if (history.author?.accountId !== accountId || !isInRange(changedAt, start, end)) {
      continue;
    }

    const meaningfulItems = (history.items ?? []).filter((item) => isMeaningfulJiraChangeField(item.field));

    if (meaningfulItems.length === 0) {
      continue;
    }

    activityTypes.add("changelog");
    pushDate(activityDates, changedAt);

    for (const item of meaningfulItems) {
      const fieldName = jiraChangeFieldName(item.field);

      if (!fieldName) {
        continue;
      }

      changedFields.add(fieldName);

      if (isJiraStatusChangeField(fieldName)) {
        statusTransitions.push({
          from: item.fromString ?? null,
          to: item.toString ?? null
        });
      }
    }
  }

  for (const comment of comments) {
    const createdAt = optionalDate(comment.created);
    const updatedAt = optionalDate(comment.updated);
    const createdByUser = comment.author?.accountId === accountId && isInRange(createdAt, start, end);
    const updatedByUser = comment.updateAuthor?.accountId === accountId && isInRange(updatedAt, start, end);
    const commentedAt = updatedByUser ? updatedAt : createdByUser ? createdAt : null;

    if (!commentedAt) {
      continue;
    }

    activityTypes.add("comment");
    commentCount += 1;
    pushDate(activityDates, commentedAt);
  }

  if (activityTypes.size === 0) {
    return null;
  }

  return {
    activityTypes: jiraActivityTypeOrder.filter((type) => activityTypes.has(type)),
    commentCount,
    worklogCount,
    durationMinutes: durationMinutes > 0 ? durationMinutes : null,
    changedFields: [...changedFields],
    statusTransitions,
    firstActivityAt: earliestDate(activityDates),
    lastActivityAt: latestDate(activityDates)
  };
}

async function getJiraProjectFilter() {
  const settings = await getCompanySettings();
  const keys = settings.jiraProjectKeys.filter((item) => item.trim().length > 0);

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

export async function syncJira(userId: string, dateString: string) {
  return runSync("JIRA", userId, dateString, async () => {
    const { start, end } = zonedDayRange(dateString, DEFAULT_TIMEZONE);
    const jira = await getJiraConnection(userId);
    const myself = await jira.fetch<JiraUser>("/rest/api/3/myself");

    await prisma.userIntegrationSettings.upsert({
      where: { userId },
      update: { jiraAccountId: myself.accountId },
      create: { userId, jiraAccountId: myself.accountId, jiraCloudId: jira.resource.id, googleTaskListIds: [] }
    });

    const projectKeys = await getJiraProjectFilter();
    const projectClause = jiraProjectClause(projectKeys);
    const issueFields = ["summary", "status", "created", "updated", "assignee", "creator", "reporter"];
    const issueMap = new Map<string, JiraIssue>();
    const issueSearches = [
      buildJiraJql([
        projectClause,
        `issuekey in updatedBy(${jiraDateLiteral(myself.accountId)}, ${jiraDateLiteral(dateString)}, ${jiraDateLiteral(nextDateString(dateString))})`
      ]),
      buildJiraJql([
        projectClause,
        `worklogDate = ${jiraDateLiteral(dateString)}`,
        "worklogAuthor = currentUser()"
      ])
    ];

    for (const jql of issueSearches) {
      for (const issue of await searchAllJiraIssues(jira, { jql, fields: issueFields })) {
        issueMap.set(issue.id || issue.key, issue);
      }
    }

    const activities: NormalizedActivity[] = [];

    for (const issue of issueMap.values()) {
      const [worklogs, changelog, comments] = await Promise.all([
        listJiraWorklogs(jira, issue.key, start, end),
        listJiraChangelog(jira, issue.key),
        listJiraComments(jira, issue.key)
      ]);
      const evidence = buildJiraIssueDayEvidence(
        issue,
        myself.accountId,
        start,
        end,
        worklogs,
        changelog,
        comments
      );

      if (evidence) {
        activities.push(normalizeJiraIssueDay(issue, evidence, jira.resource.url));
      }
    }

    return upsertImportedActivities("JIRA", userId, dateString, activities);
  });
}

export async function syncGoogleCalendar(userId: string, dateString: string) {
  return runSync("GOOGLE_CALENDAR", userId, dateString, async () => {
    const { start, end } = zonedDayRange(dateString, DEFAULT_TIMEZONE);
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

export async function syncGoogleTasks(userId: string, dateString: string) {
  return runSync("GOOGLE_TASKS", userId, dateString, async () => {
    const { start, end } = zonedDayRange(dateString, DEFAULT_TIMEZONE);
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
          reportDateString(normalized.startedAt ?? start, DEFAULT_TIMEZONE) === dateString
        ) {
          activities.push(normalized);
        }
      }
    }

    return upsertImportedActivities("GOOGLE_TASKS", userId, dateString, activities);
  });
}
