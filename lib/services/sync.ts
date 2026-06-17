import type { ActivityItem, SyncProvider } from "@prisma/client";
import type { calendar_v3, gmail_v1, tasks_v1 } from "googleapis";

import {
  importedActivityMetadata,
  importedActivityTitle,
} from "@/lib/activity-title-overrides";
import {
  DEFAULT_TIMEZONE,
  parseReportDate,
  reportDateString,
  zonedDayRange,
} from "@/lib/dates";
import { getGoogleServices } from "@/lib/integrations/google";
import { getJiraConnection } from "@/lib/integrations/jira";
import { HttpError } from "@/lib/http";
import {
  normalizeCalendarEvent,
  normalizeGoogleTask,
  normalizeJiraIssueDay,
  type JiraIssueActivityType,
  type JiraIssueDayEvidence,
  type NormalizedActivity,
} from "@/lib/normalizers";
import { prisma } from "@/lib/prisma";
import { upsertImportedActivities } from "@/lib/services/activity";
import { getCompanySettings } from "@/lib/services/company-settings";
import {
  dedupeGmailActivities,
  extractGmailActivitiesWithAI,
  gmailThreadEvidence,
  type GmailThreadEvidence,
} from "@/lib/services/gmail-ai-import";
import { createReportRevision, getReportById } from "@/lib/services/reports";

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
type GoogleCalendarEventListParams = Omit<
  calendar_v3.Params$Resource$Events$List,
  "calendarId"
>;
type GoogleTasksService = tasks_v1.Tasks;
type GoogleTaskListParams = Omit<
  tasks_v1.Params$Resource$Tasks$List,
  "tasklist"
>;
type GoogleGmailService = gmail_v1.Gmail;
type GmailThreadListParams = Omit<
  gmail_v1.Params$Resource$Users$Threads$List,
  "userId"
>;
type SyncResult = {
  importedCount: number;
  skippedCount: number;
  staleCount: number;
  activities: ActivityItem[];
  report?: {
    id: string;
    reportDate: Date;
    workLocation: string;
    summary: string;
    status: string;
    submittedAt: Date | null;
    updatedAt: Date;
  };
};
export type SyncProgressStage =
  | "starting"
  | "connecting"
  | "finding"
  | "saving"
  | "complete";
export type SyncProgressEvent = {
  stage: SyncProgressStage;
  message: string;
  current?: number;
  total?: number;
};
type SyncOptions = {
  onProgress?: (event: SyncProgressEvent) => void | Promise<void>;
};
export type GoogleTaskSuggestion = {
  taskId: string;
  taskListId: string;
  taskListTitle: string;
  title: string;
  notes: string | null;
  status: string | null;
  due: string | null;
  updated: string | null;
  sourceUrl: string | null;
};
type GoogleApiError = {
  message?: unknown;
  response?: {
    status?: unknown;
    data?: {
      error?: {
        message?: unknown;
      };
    };
  };
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
  return projectKeys.length
    ? `project in (${projectKeys.map(jiraDateLiteral).join(", ")})`
    : null;
}

function buildJiraJql(clauses: Array<string | null>, orderBy = "updated ASC") {
  return `${clauses.filter(Boolean).join(" AND ")} ORDER BY ${orderBy}`;
}

const standaloneJiraChangeFields = new Set([
  "status",
  "resolution",
]);
const supportingJiraChangeFields = new Set([
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
  "parent",
]);
type JiraChangeFieldWeight = "standalone" | "supporting";
const jiraActivityTypeOrder: JiraIssueActivityType[] = [
  "comment",
  "worklog",
  "changelog",
  "issue",
];

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

function jiraChangeFieldWeight(
  field: string | undefined,
): JiraChangeFieldWeight | null {
  const key = jiraChangeFieldKey(field);

  if (!key) {
    return null;
  }

  if (standaloneJiraChangeFields.has(key)) {
    return "standalone";
  }

  if (supportingJiraChangeFields.has(key)) {
    return "supporting";
  }

  return null;
}

function isJiraStatusChangeField(field: string | undefined) {
  return jiraChangeFieldKey(field) === "status";
}

function pushDate(values: Date[], date: Date | null) {
  if (date) {
    values.push(date);
  }
}

async function emitSyncProgress(
  options: SyncOptions | undefined,
  event: SyncProgressEvent,
) {
  await options?.onProgress?.(event);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    }),
  );

  return results;
}

function earliestDate(values: Date[]) {
  return values.reduce<Date | null>(
    (earliest, date) =>
      !earliest || date.getTime() < earliest.getTime() ? date : earliest,
    null,
  );
}

function latestDate(values: Date[]) {
  return values.reduce<Date | null>(
    (latest, date) =>
      !latest || date.getTime() > latest.getTime() ? date : latest,
    null,
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
  params: GoogleCalendarEventListParams,
) {
  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;

  do {
    const response = await calendar.events.list({
      calendarId,
      maxResults: 2500,
      ...params,
      pageToken,
    });
    events.push(...(response.data.items ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}

async function listGoogleTasks(
  tasks: GoogleTasksService,
  taskListId: string,
  params: GoogleTaskListParams,
) {
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
      pageToken,
    });
    items.push(...(response.data.items ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return items;
}

async function listGmailThreads(
  gmail: GoogleGmailService,
  params: GmailThreadListParams,
  limit?: number,
) {
  const threads: gmail_v1.Schema$Thread[] = [];
  let pageToken: string | undefined;

  do {
    const remaining =
      typeof limit === "number" ? limit - threads.length : undefined;

    if (typeof remaining === "number" && remaining <= 0) {
      break;
    }

    const response = await gmail.users.threads.list({
      userId: "me",
      maxResults:
        typeof remaining === "number" ? Math.min(100, remaining) : 100,
      includeSpamTrash: false,
      ...params,
      pageToken,
    });
    threads.push(...(response.data.threads ?? []));
    pageToken =
      typeof limit === "number" && threads.length >= limit
        ? undefined
        : response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return threads;
}

async function getGmailThread(gmail: GoogleGmailService, threadId: string) {
  const response = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  return response.data;
}

function gmailSearchTimestamp(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function googleApiErrorMessage(error: unknown) {
  const googleError = error as GoogleApiError;
  const apiMessage = googleError.response?.data?.error?.message;

  if (typeof apiMessage === "string" && apiMessage.trim()) {
    return apiMessage.trim();
  }

  return typeof googleError.message === "string" ? googleError.message : "";
}

function gmailImportError(error: unknown) {
  if (error instanceof HttpError) {
    return error;
  }

  const googleError = error as GoogleApiError;
  const status =
    typeof googleError.response?.status === "number"
      ? googleError.response.status
      : 0;
  const detail = googleApiErrorMessage(error);
  const message = error instanceof Error ? error.message : detail;

  if (
    /invalid input value for enum "(SyncProvider|ActivitySource)": "GMAIL"/i.test(
      message,
    )
  ) {
    return new HttpError(
      409,
      "Gmail import needs the latest database migration. Apply migration 20260617100000_add_gmail_activity_source, then try again.",
    );
  }

  if (
    status === 401 ||
    status === 403 ||
    /insufficient|scope|forbidden|blocked|permission|access/i.test(detail)
  ) {
    return new HttpError(
      409,
      "Reconnect Google and approve Gmail access. If this keeps failing, ask a Workspace admin to trust this app for Gmail access.",
    );
  }

  return error;
}

async function listCompletedGoogleTasksForDate(
  tasks: GoogleTasksService,
  taskListId: string,
  start: Date,
  end: Date,
) {
  return listGoogleTasks(tasks, taskListId, {
    completedMin: start.toISOString(),
    completedMax: end.toISOString(),
  });
}

function googleTaskSourceUrl(task: tasks_v1.Schema$Task) {
  return task.assignmentInfo?.linkToTask ?? task.webViewLink ?? null;
}

function googleTaskSuggestion(
  task: tasks_v1.Schema$Task,
  taskListId: string,
  taskListTitle: string,
): GoogleTaskSuggestion | null {
  if (!task.id || task.deleted || task.status === "completed") {
    return null;
  }

  return {
    taskId: task.id,
    taskListId,
    taskListTitle,
    title: task.title ?? "Untitled task",
    notes: task.notes ?? null,
    status: task.status ?? null,
    due: task.due ?? null,
    updated: task.updated ?? null,
    sourceUrl: googleTaskSourceUrl(task),
  };
}

function googleTaskSuggestionText(task: GoogleTaskSuggestion) {
  return [task.title, task.notes, task.taskListTitle]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function googleTaskSuggestionSortValue(task: GoogleTaskSuggestion) {
  const due = task.due ? new Date(task.due).getTime() : Number.MAX_SAFE_INTEGER;
  const updated = task.updated ? new Date(task.updated).getTime() : 0;

  return { due, updated };
}

async function configuredGoogleTaskLists(
  userId: string,
  tasks: GoogleTasksService,
) {
  const settings = await prisma.userIntegrationSettings.upsert({
    where: { userId },
    update: {},
    create: { userId, googleTaskListIds: [] },
  });
  const taskLists = await listAllGoogleTaskLists(tasks);
  const selectedListIds =
    settings.googleTaskListIds.length > 0
      ? new Set(settings.googleTaskListIds)
      : new Set(taskLists.map((list) => list.id).filter(Boolean) as string[]);

  return taskLists.filter(
    (taskList) => taskList.id && selectedListIds.has(taskList.id),
  );
}

export async function searchIncompleteGoogleTasks(
  userId: string,
  query: string,
  limit = 12,
) {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length < 2) {
    return [];
  }

  const services = await getGoogleServices(userId);
  const taskLists = await configuredGoogleTaskLists(userId, services.tasks);
  const suggestions: GoogleTaskSuggestion[] = [];

  for (const taskList of taskLists) {
    if (!taskList.id) {
      continue;
    }

    const tasks = await listGoogleTasks(services.tasks, taskList.id, {
      showCompleted: false,
    });
    const taskListTitle = taskList.title ?? "Google Tasks";

    for (const task of tasks) {
      const suggestion = googleTaskSuggestion(task, taskList.id, taskListTitle);

      if (
        suggestion &&
        googleTaskSuggestionText(suggestion).includes(normalizedQuery)
      ) {
        suggestions.push(suggestion);
      }
    }
  }

  return suggestions
    .sort((first, second) => {
      const firstSort = googleTaskSuggestionSortValue(first);
      const secondSort = googleTaskSuggestionSortValue(second);

      return (
        firstSort.due - secondSort.due ||
        secondSort.updated - firstSort.updated ||
        first.title.localeCompare(second.title)
      );
    })
    .slice(0, limit);
}

export async function addGoogleTaskReference(
  userId: string,
  dateString: string,
  taskListId: string,
  taskId: string,
) {
  const services = await getGoogleServices(userId);
  const taskLists = await configuredGoogleTaskLists(userId, services.tasks);
  const taskList = taskLists.find((item) => item.id === taskListId);

  if (!taskList?.id) {
    throw new HttpError(404, "Google Task list is not available.");
  }

  const taskResponse = await services.tasks.tasks.get({
    tasklist: taskList.id,
    task: taskId,
  });
  const task = taskResponse.data;
  const normalized = normalizeGoogleTask(
    task,
    taskList.id,
    taskList.title ?? "Google Tasks",
  );

  if (!normalized || task.status === "completed") {
    throw new HttpError(
      400,
      "Choose an incomplete Google Task to add manually.",
    );
  }

  const reportDate = parseReportDate(dateString);
  const report = await prisma.dailyReport.upsert({
    where: {
      userId_reportDate: {
        userId,
        reportDate,
      },
    },
    update: {},
    create: {
      userId,
      reportDate,
    },
  });

  await createReportRevision(report.id, userId);

  const activityWhere = {
    userId_reportDate_source_sourceId: {
      userId,
      reportDate,
      source: "GOOGLE_TASKS" as const,
      sourceId: normalized.sourceId,
    },
  };
  const existingActivity = await prisma.activityItem.findUnique({
    where: activityWhere,
    select: {
      title: true,
      metadata: true,
    },
  });
  const activityMetadata = importedActivityMetadata(
    {
      ...normalized.metadata,
      manuallyAdded: true,
    },
    normalized.title,
    existingActivity,
  );
  const activityTitle = importedActivityTitle(
    normalized.title,
    existingActivity,
  );

  await prisma.activityItem.upsert({
    where: activityWhere,
    update: {
      dailyReportId: report.id,
      sourceContainerId: normalized.sourceContainerId ?? null,
      title: activityTitle,
      description: normalized.description ?? null,
      status: "in progress",
      sourceUrl: normalized.sourceUrl ?? null,
      startedAt: normalized.startedAt ?? null,
      endedAt: normalized.endedAt ?? null,
      durationMinutes: normalized.durationMinutes ?? null,
      selected: true,
      staleAt: null,
      metadata: activityMetadata,
    },
    create: {
      userId,
      dailyReportId: report.id,
      reportDate,
      source: "GOOGLE_TASKS",
      sourceId: normalized.sourceId,
      sourceContainerId: normalized.sourceContainerId ?? null,
      title: activityTitle,
      description: normalized.description ?? null,
      status: "in progress",
      sourceUrl: normalized.sourceUrl ?? null,
      startedAt: normalized.startedAt ?? null,
      endedAt: normalized.endedAt ?? null,
      durationMinutes: normalized.durationMinutes ?? null,
      selected: true,
      metadata: activityMetadata,
    },
  });

  await prisma.dailyReport.update({
    where: { id: report.id },
    data: { updatedAt: new Date() },
  });

  return getReportById(report.id);
}

async function searchAllJiraIssues(
  jira: JiraConnection,
  input: { jql: string; fields: string[] },
) {
  const issues: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  do {
    const search = await jira.fetch<JiraSearchResponse>(
      "/rest/api/3/search/jql",
      {
        method: "POST",
        body: JSON.stringify({
          ...input,
          maxResults: 100,
          nextPageToken,
        }),
      },
    );
    issues.push(...(search.issues ?? []));
    nextPageToken = search.nextPageToken ?? undefined;
  } while (nextPageToken);

  return issues;
}

async function listJiraWorklogs(
  jira: JiraConnection,
  issueKey: string,
  start: Date,
  end: Date,
) {
  const worklogs: NonNullable<JiraWorklogResponse["worklogs"]> = [];
  let startAt = 0;
  let total = 0;

  do {
    const response = await jira.fetch<JiraWorklogResponse>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog?startedAfter=${start.getTime()}&startedBefore=${end.getTime()}&startAt=${startAt}&maxResults=100`,
    );
    const page = response.worklogs ?? [];
    worklogs.push(...page);
    total = response.total ?? worklogs.length;
    startAt =
      (response.startAt ?? startAt) +
      Math.max(response.maxResults ?? page.length, page.length, 1);
  } while (startAt < total);

  return worklogs;
}

async function listJiraChangelog(jira: JiraConnection, issueKey: string) {
  const values: NonNullable<JiraChangelogResponse["values"]> = [];
  let startAt = 0;
  let total = 0;

  do {
    const response = await jira.fetch<JiraChangelogResponse>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?startAt=${startAt}&maxResults=100`,
    );
    const page = response.values ?? [];
    values.push(...page);
    total = response.total ?? values.length;
    startAt =
      (response.startAt ?? startAt) +
      Math.max(response.maxResults ?? page.length, page.length, 1);
  } while (startAt < total);

  return values;
}

async function listJiraComments(jira: JiraConnection, issueKey: string) {
  const comments: NonNullable<JiraCommentResponse["comments"]> = [];
  let startAt = 0;
  let total = 0;

  do {
    const response = await jira.fetch<JiraCommentResponse>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?startAt=${startAt}&maxResults=100&orderBy=created`,
    );
    const page = response.comments ?? [];
    comments.push(...page);
    total = response.total ?? comments.length;
    startAt =
      (response.startAt ?? startAt) +
      Math.max(response.maxResults ?? page.length, page.length, 1);
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
  comments: JiraComment[],
): JiraIssueDayEvidence | null {
  const activityTypes = new Set<JiraIssueActivityType>();
  const activityDates: Date[] = [];
  const changedFields = new Set<string>();
  const statusTransitions: NonNullable<
    JiraIssueDayEvidence["statusTransitions"]
  > = [];
  let hasStandaloneChangelog = false;
  let commentCount = 0;
  let worklogCount = 0;
  let durationMinutes = 0;
  const issueCreatedAt = optionalDate(issue.fields?.created);

  if (
    issue.fields?.creator?.accountId === accountId &&
    isInRange(issueCreatedAt, start, end)
  ) {
    activityTypes.add("issue");
    pushDate(activityDates, issueCreatedAt);
  }

  for (const worklog of worklogs) {
    const startedAt = optionalDate(worklog.started);

    if (
      worklog.author?.accountId !== accountId ||
      !isInRange(startedAt, start, end)
    ) {
      continue;
    }

    const minutes = worklog.timeSpentSeconds
      ? Math.round(worklog.timeSpentSeconds / 60)
      : 0;
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

    if (
      history.author?.accountId !== accountId ||
      !isInRange(changedAt, start, end)
    ) {
      continue;
    }

    const recognizedItems = (history.items ?? []).filter((item) =>
      jiraChangeFieldWeight(item.field),
    );

    if (recognizedItems.length === 0) {
      continue;
    }

    pushDate(activityDates, changedAt);

    for (const item of recognizedItems) {
      const fieldName = jiraChangeFieldName(item.field);
      const fieldWeight = jiraChangeFieldWeight(item.field);

      if (!fieldName || !fieldWeight) {
        continue;
      }

      changedFields.add(fieldName);
      if (fieldWeight === "standalone") {
        hasStandaloneChangelog = true;
      }

      if (isJiraStatusChangeField(fieldName)) {
        statusTransitions.push({
          from: item.fromString ?? null,
          to: item.toString ?? null,
        });
      }
    }
  }

  for (const comment of comments) {
    const createdAt = optionalDate(comment.created);
    const updatedAt = optionalDate(comment.updated);
    const createdByUser =
      comment.author?.accountId === accountId &&
      isInRange(createdAt, start, end);
    const updatedByUser =
      comment.updateAuthor?.accountId === accountId &&
      isInRange(updatedAt, start, end);
    const commentedAt = updatedByUser
      ? updatedAt
      : createdByUser
        ? createdAt
        : null;

    if (!commentedAt) {
      continue;
    }

    activityTypes.add("comment");
    commentCount += 1;
    pushDate(activityDates, commentedAt);
  }

  if (changedFields.size > 0 && (hasStandaloneChangelog || activityTypes.size > 0)) {
    activityTypes.add("changelog");
  }

  if (activityTypes.size === 0) {
    return null;
  }

  return {
    activityTypes: jiraActivityTypeOrder.filter((type) =>
      activityTypes.has(type),
    ),
    commentCount,
    worklogCount,
    durationMinutes: durationMinutes > 0 ? durationMinutes : null,
    changedFields: [...changedFields],
    statusTransitions,
    firstActivityAt: earliestDate(activityDates),
    lastActivityAt: latestDate(activityDates),
  };
}

async function getJiraProjectFilter() {
  const settings = await getCompanySettings();
  const keys = settings.jiraProjectKeys.filter(
    (item) => item.trim().length > 0,
  );

  return keys.map((key) => key.trim().toUpperCase());
}

async function runSync(
  provider: SyncProvider,
  userId: string,
  dateString: string,
  options: SyncOptions | undefined,
  callback: () => Promise<SyncResult>,
) {
  const reportDate = parseReportDate(dateString);
  await emitSyncProgress(options, {
    stage: "starting",
    message: "Starting import...",
  });

  const syncRun = await prisma.syncRun.create({
    data: {
      userId,
      provider,
      rangeStart: reportDate,
      rangeEnd: reportDate,
      status: "RUNNING",
    },
  });

  try {
    const result = await callback();
    await emitSyncProgress(options, {
      stage: "complete",
      message: "Import complete.",
      current: result.importedCount,
      total: result.importedCount,
    });

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "SUCCEEDED",
        importedCount: result.importedCount,
        skippedCount: result.skippedCount,
        completedAt: new Date(),
      },
    });

    return result;
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Unknown sync error.",
        completedAt: new Date(),
      },
    });

    throw error;
  }
}

export async function syncJira(
  userId: string,
  dateString: string,
  options?: SyncOptions,
) {
  return runSync("JIRA", userId, dateString, options, async () => {
    const { start, end } = zonedDayRange(dateString, DEFAULT_TIMEZONE);
    await emitSyncProgress(options, {
      stage: "connecting",
      message: "Connecting to Jira...",
    });
    const jira = await getJiraConnection(userId);
    const myself = await jira.fetch<JiraUser>("/rest/api/3/myself");

    await prisma.userIntegrationSettings.upsert({
      where: { userId },
      update: { jiraAccountId: myself.accountId },
      create: {
        userId,
        jiraAccountId: myself.accountId,
        jiraCloudId: jira.resource.id,
        googleTaskListIds: [],
      },
    });

    const projectKeys = await getJiraProjectFilter();
    const projectClause = jiraProjectClause(projectKeys);
    const issueFields = [
      "summary",
      "status",
      "created",
      "updated",
      "assignee",
      "creator",
      "reporter",
    ];
    const issueMap = new Map<string, JiraIssue>();
    const issueSearches = [
      buildJiraJql([
        projectClause,
        `issuekey in updatedBy(${jiraDateLiteral(myself.accountId)}, ${jiraDateLiteral(dateString)}, ${jiraDateLiteral(nextDateString(dateString))})`,
      ]),
      buildJiraJql([
        projectClause,
        `worklogDate = ${jiraDateLiteral(dateString)}`,
        "worklogAuthor = currentUser()",
      ]),
    ];

    await emitSyncProgress(options, {
      stage: "finding",
      message: "Finding Jira work items...",
    });
    for (const jql of issueSearches) {
      for (const issue of await searchAllJiraIssues(jira, {
        jql,
        fields: issueFields,
      })) {
        issueMap.set(issue.id || issue.key, issue);
      }
    }

    const issues = [...issueMap.values()];
    const activities = (
      await mapWithConcurrency(issues, 4, async (issue, index) => {
        await emitSyncProgress(options, {
          stage: "finding",
          message: `Reading Jira issue ${index + 1} of ${issues.length}...`,
          current: index + 1,
          total: issues.length,
        });
        const [worklogs, changelog, comments] = await Promise.all([
          listJiraWorklogs(jira, issue.key, start, end),
          listJiraChangelog(jira, issue.key),
          listJiraComments(jira, issue.key),
        ]);
        const evidence = buildJiraIssueDayEvidence(
          issue,
          myself.accountId,
          start,
          end,
          worklogs,
          changelog,
          comments,
        );

        if (evidence) {
          return normalizeJiraIssueDay(issue, evidence, jira.resource.url);
        }

        return null;
      })
    ).filter((activity): activity is NormalizedActivity => Boolean(activity));

    await emitSyncProgress(options, {
      stage: "saving",
      message: `Saving ${activities.length} Jira work item${activities.length === 1 ? "" : "s"}...`,
    });
    return upsertImportedActivities("JIRA", userId, dateString, activities);
  });
}

export async function syncGoogleCalendar(
  userId: string,
  dateString: string,
  options?: SyncOptions,
) {
  return runSync("GOOGLE_CALENDAR", userId, dateString, options, async () => {
    const { start, end } = zonedDayRange(dateString, DEFAULT_TIMEZONE);
    await emitSyncProgress(options, {
      stage: "connecting",
      message: "Connecting to Google Calendar...",
    });
    const services = await getGoogleServices(userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const settings = await prisma.userIntegrationSettings.upsert({
      where: { userId },
      update: {},
      create: { userId, googleTaskListIds: [] },
    });

    await emitSyncProgress(options, {
      stage: "finding",
      message: "Finding calendar events...",
    });
    const events = await listGoogleCalendarEvents(
      services.calendar,
      settings.googleCalendarId || "primary",
      {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      },
    );

    const activities = events
      .map((event) => normalizeCalendarEvent(event, user?.email))
      .filter((item): item is NormalizedActivity => Boolean(item));

    await emitSyncProgress(options, {
      stage: "saving",
      message: `Saving ${activities.length} calendar item${activities.length === 1 ? "" : "s"}...`,
    });
    return upsertImportedActivities(
      "GOOGLE_CALENDAR",
      userId,
      dateString,
      activities,
    );
  });
}

export async function syncGoogleTasks(
  userId: string,
  dateString: string,
  options?: SyncOptions,
) {
  return runSync("GOOGLE_TASKS", userId, dateString, options, async () => {
    const { start, end } = zonedDayRange(dateString, DEFAULT_TIMEZONE);
    await emitSyncProgress(options, {
      stage: "connecting",
      message: "Connecting to Google Tasks...",
    });
    const services = await getGoogleServices(userId);
    const taskLists = await configuredGoogleTaskLists(userId, services.tasks);

    await emitSyncProgress(options, {
      stage: "finding",
      message: "Finding completed tasks...",
    });
    const activitiesByList = await mapWithConcurrency(
      taskLists,
      4,
      async (taskList, index) => {
        if (!taskList.id) {
          return [];
        }

        await emitSyncProgress(options, {
          stage: "finding",
          message: `Reading task list ${index + 1} of ${taskLists.length}...`,
          current: index + 1,
          total: taskLists.length,
        });
        const tasks = await listCompletedGoogleTasksForDate(
          services.tasks,
          taskList.id,
          start,
          end,
        );
        const listActivities: NormalizedActivity[] = [];

        for (const task of tasks) {
          const normalized = normalizeGoogleTask(
            task,
            taskList.id,
            taskList.title ?? "Google Tasks",
          );

          if (!normalized) {
            continue;
          }

          if (
            isInRange(normalized.startedAt, start, end) ||
            isInRange(normalized.endedAt, start, end) ||
            reportDateString(
              normalized.startedAt ?? start,
              DEFAULT_TIMEZONE,
            ) === dateString
          ) {
            listActivities.push(normalized);
          }
        }

        return listActivities;
      },
    );
    const activities = activitiesByList.flat();

    await emitSyncProgress(options, {
      stage: "saving",
      message: `Saving ${activities.length} task${activities.length === 1 ? "" : "s"}...`,
    });
    return upsertImportedActivities(
      "GOOGLE_TASKS",
      userId,
      dateString,
      activities,
    );
  });
}

export async function syncGmail(
  userId: string,
  dateString: string,
  options?: SyncOptions,
) {
  try {
    return await runSync("GMAIL", userId, dateString, options, async () => {
      try {
        const { start, end } = zonedDayRange(dateString, DEFAULT_TIMEZONE);
        const reportDate = parseReportDate(dateString);
        await emitSyncProgress(options, {
          stage: "connecting",
          message: "Connecting to Gmail...",
        });
        const services = await getGoogleServices(userId);
        const query = [
          "in:sent",
          `after:${gmailSearchTimestamp(start)}`,
          `before:${gmailSearchTimestamp(end)}`,
          "-in:spam",
          "-in:trash",
        ].join(" ");

        await emitSyncProgress(options, {
          stage: "finding",
          message: "Finding Gmail threads...",
        });
        const threadStubs = await listGmailThreads(services.gmail, { q: query });
        const readableThreadStubs = threadStubs.filter((thread) => thread.id);
        const threads = await mapWithConcurrency(
          readableThreadStubs,
          4,
          async (thread, index) => {
            await emitSyncProgress(options, {
              stage: "finding",
              message: `Reading Gmail thread ${index + 1} of ${readableThreadStubs.length}...`,
              current: index + 1,
              total: readableThreadStubs.length,
            });

            return getGmailThread(services.gmail, thread.id!);
          },
        );
        const evidence = threads
          .map((thread) => gmailThreadEvidence(thread, start, end))
          .filter((thread): thread is GmailThreadEvidence => Boolean(thread));

        await emitSyncProgress(options, {
          stage: "finding",
          message: `Classifying ${evidence.length} Gmail thread${evidence.length === 1 ? "" : "s"} with AI...`,
          current: evidence.length,
          total: evidence.length,
        });
        const extractedActivities = await extractGmailActivitiesWithAI(
          userId,
          dateString,
          evidence,
          start,
          end,
        );
        const existingActivities = await prisma.activityItem.findMany({
          where: {
            userId,
            reportDate,
            OR: [{ staleAt: null }, { source: "GMAIL" }],
          },
          select: {
            source: true,
            sourceId: true,
            sourceContainerId: true,
            sourceUrl: true,
            title: true,
            description: true,
            metadata: true,
            staleAt: true,
          },
        });
        const activities = dedupeGmailActivities(
          extractedActivities,
          existingActivities,
          evidence,
        );

        await emitSyncProgress(options, {
          stage: "saving",
          message: `Saving ${activities.length} Gmail work item${activities.length === 1 ? "" : "s"}...`,
        });

        return upsertImportedActivities("GMAIL", userId, dateString, activities);
      } catch (error) {
        throw gmailImportError(error);
      }
    });
  } catch (error) {
    throw gmailImportError(error);
  }
}
