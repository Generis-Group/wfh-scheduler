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

export type JiraIssueActivityType = "comment" | "worklog" | "changelog" | "issue";

export type JiraStatusTransition = {
  from?: string | null;
  to?: string | null;
};

export type JiraIssueDayEvidence = {
  activityTypes: JiraIssueActivityType[];
  commentCount?: number;
  worklogCount?: number;
  durationMinutes?: number | null;
  changedFields?: string[];
  statusTransitions?: JiraStatusTransition[];
  firstActivityAt?: Date | null;
  lastActivityAt?: Date | null;
};

function issueUrl(siteUrl: string | undefined, issueKey: string) {
  return siteUrl ? `${siteUrl.replace(/\/$/, "")}/browse/${issueKey}` : undefined;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${remainingMinutes}m`;
}

function joinFieldList(fields: string[]) {
  if (fields.length <= 1) {
    return fields[0] ?? "";
  }

  if (fields.length === 2) {
    return `${fields[0]} and ${fields[1]}`;
  }

  return `${fields.slice(0, -1).join(", ")}, and ${fields.at(-1)}`;
}

function evidenceDescription(evidence: JiraIssueDayEvidence) {
  const parts: string[] = [];
  const commentCount = evidence.commentCount ?? 0;
  const durationMinutes = evidence.durationMinutes ?? 0;
  const changedFields = uniqueStrings(evidence.changedFields ?? []);
  const hasStatusChange = changedFields.some((field) => field.toLowerCase() === "status");
  const nonStatusFields = changedFields.filter((field) => field.toLowerCase() !== "status");

  if (commentCount > 0) {
    parts.push(commentCount === 1 ? "Commented" : `Commented ${commentCount} times`);
  }

  if (durationMinutes > 0) {
    parts.push(`Logged ${formatDuration(durationMinutes)}`);
  }

  if (hasStatusChange) {
    parts.push("Changed status");
  }

  if (nonStatusFields.length > 0) {
    parts.push(`Updated ${joinFieldList(nonStatusFields)}`);
  }

  if (parts.length === 0 && evidence.activityTypes.includes("issue")) {
    parts.push("Updated issue");
  }

  return parts.join(", ") || "Updated issue";
}

export function normalizeJiraIssueDay(
  issue: JiraIssue,
  evidence: JiraIssueDayEvidence,
  siteUrl?: string
): NormalizedActivity {
  const durationMinutes =
    evidence.durationMinutes && evidence.durationMinutes > 0 ? evidence.durationMinutes : null;
  const changedFields = uniqueStrings(evidence.changedFields ?? []);

  return {
    source: "JIRA",
    sourceId: `issue:${issue.id}`,
    sourceContainerId: issue.key,
    title: `${issue.key}: ${issue.fields?.summary ?? "Untitled Jira issue"}`,
    description: evidenceDescription(evidence),
    status: issue.fields?.status?.name ?? null,
    sourceUrl: issueUrl(siteUrl, issue.key),
    startedAt: evidence.firstActivityAt ?? null,
    endedAt: evidence.lastActivityAt ?? null,
    durationMinutes,
    metadata: {
      kind: "issue-day",
      key: issue.key,
      issueId: issue.id,
      activityTypes: evidence.activityTypes,
      commentCount: evidence.commentCount ?? 0,
      worklogCount: evidence.worklogCount ?? 0,
      changedFields,
      statusTransitions: evidence.statusTransitions ?? [],
      firstActivityAt: evidence.firstActivityAt?.toISOString() ?? null,
      lastActivityAt: evidence.lastActivityAt?.toISOString() ?? null,
      assignee: issue.fields?.assignee?.displayName ?? null,
      reporter: issue.fields?.reporter?.displayName ?? null
    }
  };
}
