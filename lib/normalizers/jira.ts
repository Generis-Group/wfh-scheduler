import type { NormalizedActivity } from "@/lib/normalizers/types";

type JiraIssue = {
  id: string;
  key: string;
  self?: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    updated?: string;
    assignee?: { displayName?: string; accountId?: string };
    reporter?: { displayName?: string; accountId?: string };
  };
};

type JiraWorklog = {
  id: string;
  started?: string;
  timeSpentSeconds?: number;
  comment?: unknown;
  author?: { accountId?: string; displayName?: string };
};

type JiraChangelog = {
  id: string;
  created?: string;
  author?: { accountId?: string; displayName?: string };
  items?: Array<{ field?: string; fromString?: string; toString?: string }>;
};

type JiraComment = {
  id: string;
  created?: string;
  updated?: string;
  body?: unknown;
  author?: { accountId?: string; displayName?: string };
};

function issueUrl(siteUrl: string | undefined, issueKey: string) {
  return siteUrl ? `${siteUrl.replace(/\/$/, "")}/browse/${issueKey}` : undefined;
}

function commentToText(comment: unknown) {
  if (!comment) {
    return null;
  }

  if (typeof comment === "string") {
    return comment;
  }

  if (typeof comment === "object") {
    return JSON.stringify(comment);
  }

  return String(comment);
}

export function normalizeJiraIssue(issue: JiraIssue, siteUrl?: string): NormalizedActivity {
  const updatedAt = issue.fields?.updated ? new Date(issue.fields.updated) : null;

  return {
    source: "JIRA",
    sourceId: `issue:${issue.id}`,
    sourceContainerId: issue.key,
    title: `${issue.key}: ${issue.fields?.summary ?? "Untitled Jira issue"}`,
    status: issue.fields?.status?.name ?? null,
    sourceUrl: issueUrl(siteUrl, issue.key),
    startedAt: updatedAt,
    endedAt: updatedAt,
    metadata: {
      kind: "issue",
      key: issue.key,
      assignee: issue.fields?.assignee?.displayName,
      reporter: issue.fields?.reporter?.displayName
    }
  };
}

export function normalizeJiraWorklog(
  issue: JiraIssue,
  worklog: JiraWorklog,
  siteUrl?: string
): NormalizedActivity {
  const startedAt = worklog.started ? new Date(worklog.started) : null;
  const durationMinutes = worklog.timeSpentSeconds ? Math.round(worklog.timeSpentSeconds / 60) : null;
  const endedAt =
    startedAt && durationMinutes ? new Date(startedAt.getTime() + durationMinutes * 60_000) : startedAt;

  return {
    source: "JIRA",
    sourceId: `worklog:${worklog.id}`,
    sourceContainerId: issue.key,
    title: `${issue.key}: worklog${durationMinutes ? ` (${durationMinutes} min)` : ""}`,
    description: commentToText(worklog.comment),
    status: issue.fields?.status?.name ?? null,
    sourceUrl: issueUrl(siteUrl, issue.key),
    startedAt,
    endedAt,
    durationMinutes,
    metadata: {
      kind: "worklog",
      key: issue.key,
      author: worklog.author?.displayName
    }
  };
}

export function normalizeJiraChangelog(
  issue: JiraIssue,
  changelog: JiraChangelog,
  siteUrl?: string
): NormalizedActivity | null {
  const createdAt = changelog.created ? new Date(changelog.created) : null;
  const fields = changelog.items?.map((item) => item.field).filter(Boolean).join(", ");

  if (!fields) {
    return null;
  }

  return {
    source: "JIRA",
    sourceId: `changelog:${issue.id}:${changelog.id}`,
    sourceContainerId: issue.key,
    title: `${issue.key}: changed ${fields}`,
    status: issue.fields?.status?.name ?? null,
    sourceUrl: issueUrl(siteUrl, issue.key),
    startedAt: createdAt,
    endedAt: createdAt,
    metadata: {
      kind: "changelog",
      key: issue.key,
      author: changelog.author?.displayName,
      fields
    }
  };
}

export function normalizeJiraComment(issue: JiraIssue, comment: JiraComment, siteUrl?: string): NormalizedActivity {
  const createdAt = comment.created ? new Date(comment.created) : null;

  return {
    source: "JIRA",
    sourceId: `comment:${issue.id}:${comment.id}`,
    sourceContainerId: issue.key,
    title: `${issue.key}: comment added`,
    description: commentToText(comment.body),
    status: issue.fields?.status?.name ?? null,
    sourceUrl: issueUrl(siteUrl, issue.key),
    startedAt: createdAt,
    endedAt: createdAt,
    metadata: {
      kind: "comment",
      key: issue.key,
      author: comment.author?.displayName
    }
  };
}
