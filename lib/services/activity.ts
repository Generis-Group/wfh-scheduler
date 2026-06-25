import type { ActivitySource, Prisma } from "@prisma/client";
import { createHash } from "crypto";

import {
  metadataWithRelatedSourceLinks,
  relatedActivityIdFromMetadata,
  relatedSourceLinksFromMetadata,
  sourceLinkForActivity,
  uniqueActivitySourceLinks,
} from "@/lib/activity-source-links";
import {
  importedActivityMetadata,
  importedActivityTitle,
} from "@/lib/activity-title-overrides";
import { parseReportDate } from "@/lib/dates";
import type { NormalizedActivity } from "@/lib/normalizers/types";
import { prisma } from "@/lib/prisma";

function isManualGoogleTaskReference(metadata: Prisma.JsonValue | null) {
  return Boolean(
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    (metadata as { manuallyAdded?: unknown }).manuallyAdded === true,
  );
}

export async function listActivities(userId: string, dateString: string) {
  return prisma.activityItem.findMany({
    where: {
      userId,
      reportDate: parseReportDate(dateString),
      staleAt: null,
    },
    orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
  });
}

type ImportedActivitySource = Exclude<ActivitySource, "MANUAL">;
const importedDraftReportSelect = {
  id: true,
  userId: true,
  reportDate: true,
  workLocation: true,
  summary: true,
  status: true,
  submittedAt: true,
  updatedAt: true,
};

type ExistingImportedActivity = {
  id: string;
  dailyReportId: string | null;
  sourceId: string | null;
  sourceContainerId: string | null;
  title: string;
  description: string | null;
  status: string | null;
  sourceUrl: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  durationMinutes: number | null;
  selected: boolean;
  metadata: Prisma.JsonValue | null;
  staleAt: Date | null;
};
type RelatedActivityTarget = {
  id: string;
  dailyReportId: string | null;
  metadata: Prisma.JsonValue | null;
};
type ImportedDraftReport = {
  id: string;
  userId: string;
  reportDate: Date;
  workLocation: string;
  summary: string;
  status: string;
  submittedAt: Date | null;
  updatedAt: Date;
};

function dateValue(value: Date | null | undefined) {
  return value?.getTime() ?? null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    const record = value as Record<string, unknown>;

    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function importedActivityData(
  item: NormalizedActivity,
  existingActivity?: ExistingImportedActivity,
) {
  const title = importedActivityTitle(item.title, existingActivity);
  const metadata = importedActivityMetadata(
    item.metadata,
    item.title,
    existingActivity,
  );

  return {
    sourceContainerId: item.sourceContainerId ?? null,
    title,
    description: item.description ?? null,
    status: item.status ?? null,
    sourceUrl: item.sourceUrl ?? null,
    startedAt: item.startedAt ?? null,
    endedAt: item.endedAt ?? null,
    durationMinutes: item.durationMinutes ?? null,
    metadata,
    selected: existingActivity?.selected ?? item.selected ?? true,
    staleAt: null,
  };
}

function importedActivityChanged(
  existing: ExistingImportedActivity,
  data: ReturnType<typeof importedActivityData>,
  dailyReportId: string,
) {
  return (
    existing.dailyReportId !== dailyReportId ||
    existing.sourceContainerId !== data.sourceContainerId ||
    existing.title !== data.title ||
    existing.description !== data.description ||
    existing.status !== data.status ||
    existing.sourceUrl !== data.sourceUrl ||
    dateValue(existing.startedAt) !== dateValue(data.startedAt) ||
    dateValue(existing.endedAt) !== dateValue(data.endedAt) ||
    existing.durationMinutes !== data.durationMinutes ||
    existing.selected !== data.selected ||
    Boolean(existing.staleAt) ||
    stableJson(existing.metadata) !== stableJson(data.metadata)
  );
}

function normalizedTaskKeyText(value?: string | null) {
  return value
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function importText(item: NormalizedActivity) {
  const metadata = metadataRecord(item.metadata);

  return [
    item.title,
    item.description,
    item.sourceId,
    item.sourceUrl,
    item.sourceContainerId,
    metadata?.jiraKey,
    metadata?.taskKey,
    metadata?.issueKey,
    metadata?.threadId,
    metadata?.conversationId,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function jiraKeys(value: string) {
  return Array.from(value.matchAll(/\b[A-Z][A-Z0-9]+-\d+\b/g)).map((match) =>
    match[0].toUpperCase(),
  );
}

function normalizedTaskUrl(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.hash = "";
    url.search = "";

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function importReferenceKeys(item: NormalizedActivity) {
  const keys = new Set<string>();
  const text = importText(item);

  for (const key of jiraKeys(text)) {
    keys.add(`jira:${key}`);
  }

  if (item.source === "GOOGLE_TASKS") {
    keys.add(`google-task:${item.sourceId}`);

    const sourceUrl = normalizedTaskUrl(item.sourceUrl);

    if (sourceUrl) {
      keys.add(`google-task-url:${sourceUrl}`);
    }
  }

  return keys;
}

function metadataStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function messageIdsKey(item: NormalizedActivity) {
  const messageIds = metadataStringArray(
    metadataRecord(item.metadata)?.messageIds,
  );

  return [...new Set(messageIds)].sort().join("\u0000");
}

function sourceContainerKey(item: NormalizedActivity) {
  const metadata = metadataRecord(item.metadata);
  const container =
    item.sourceContainerId ??
    metadata?.threadId ??
    metadata?.conversationId ??
    null;

  return typeof container === "string" && container.trim()
    ? container.trim()
    : null;
}

const weakTaskTitleWords = new Set([
  "activity",
  "complete",
  "completed",
  "done",
  "item",
  "items",
  "noted",
  "status",
  "task",
  "tasks",
  "update",
  "updated",
  "work",
]);

function comparableTaskTitle(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/\b[a-z][a-z0-9]+-\d+\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function meaningfulTitleTokens(value?: string | null) {
  return new Set(
    comparableTaskTitle(value)
      .split(" ")
      .filter(
        (word) =>
          word.length > 2 &&
          !/^\d+$/.test(word) &&
          !weakTaskTitleWords.has(word),
      ),
  );
}

function titleSimilarity(first?: string | null, second?: string | null) {
  const firstTitle = comparableTaskTitle(first);
  const secondTitle = comparableTaskTitle(second);

  if (!firstTitle || !secondTitle) {
    return false;
  }

  if (firstTitle === secondTitle) {
    return true;
  }

  const firstTokens = meaningfulTitleTokens(firstTitle);
  const secondTokens = meaningfulTitleTokens(secondTitle);
  const smallerSize = Math.min(firstTokens.size, secondTokens.size);

  if (smallerSize < 2) {
    return false;
  }

  const shared = [...firstTokens].filter((token) => secondTokens.has(token));
  const unionSize = new Set([...firstTokens, ...secondTokens]).size;

  if (shared.length >= smallerSize && smallerSize <= 3) {
    return true;
  }

  return shared.length >= 2 && shared.length / unionSize >= 0.6;
}

function hasSharedReferenceKey(first: Set<string>, second: Set<string>) {
  for (const key of first) {
    if (second.has(key)) {
      return true;
    }
  }

  return false;
}

function importTaskKey(item: NormalizedActivity) {
  if (item.source === "HUBSPOT") {
    const titleKey = normalizedTaskKeyText(item.title);

    if (titleKey) {
      return `${item.source}:title:${item.sourceContainerId ?? ""}:${titleKey}`;
    }
  }

  return `${item.source}:source:${item.sourceId}`;
}

function isDuplicateImportTask(
  first: NormalizedActivity,
  second: NormalizedActivity,
) {
  if (first.source !== second.source) {
    return false;
  }

  const firstReferenceKeys = importReferenceKeys(first);
  const secondReferenceKeys = importReferenceKeys(second);

  if (
    firstReferenceKeys.size > 0 &&
    hasSharedReferenceKey(firstReferenceKeys, secondReferenceKeys)
  ) {
    return true;
  }

  const firstContainer = sourceContainerKey(first);
  const secondContainer = sourceContainerKey(second);

  return Boolean(
    firstContainer &&
      secondContainer &&
      firstContainer === secondContainer &&
      titleSimilarity(first.title, second.title),
  );
}

function stableImportKeys(item: NormalizedActivity) {
  const referenceKeys = [...importReferenceKeys(item)].sort();

  if (referenceKeys.length > 0) {
    return referenceKeys.map((key) => `reference:${key}`);
  }

  const container = sourceContainerKey(item);
  const messageKey = messageIdsKey(item);

  if (container && messageKey) {
    return [`${item.source}:container:${container}:messages:${messageKey}`];
  }

  const titleKey = [...meaningfulTitleTokens(item.title)].sort().join("\u0000");

  if (container && titleKey) {
    return [`${item.source}:container:${container}:title:${titleKey}`];
  }

  return [`${item.source}:source:${item.sourceId}`];
}

function mergedImportKey(group: {
  activity: NormalizedActivity;
  stableKeys: string[];
}) {
  const keys = [...new Set(group.stableKeys)].sort();

  return `${group.activity.source}:${keys.join("\u0001")}`;
}

function mergedSourceId(source: ActivitySource, key: string) {
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 24);

  return `merged:${source.toLowerCase()}:${hash}`;
}

function earliestDate(
  first: Date | null | undefined,
  second: Date | null | undefined,
) {
  if (!first) {
    return second ?? null;
  }

  if (!second) {
    return first;
  }

  return first.getTime() <= second.getTime() ? first : second;
}

function latestDate(
  first: Date | null | undefined,
  second: Date | null | undefined,
) {
  if (!first) {
    return second ?? null;
  }

  if (!second) {
    return first;
  }

  return first.getTime() >= second.getTime() ? first : second;
}

function summedDuration(
  first: number | null | undefined,
  second: number | null | undefined,
) {
  if (first == null && second == null) {
    return null;
  }

  return (first ?? 0) + (second ?? 0);
}

function mergedMetadata(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined,
) {
  const metadata = { ...(existing ?? {}) };

  for (const [key, value] of Object.entries(incoming ?? {})) {
    if (metadata[key] === undefined) {
      metadata[key] = value;
    }
  }

  return metadata;
}

function mergeDuplicateImportActivities(activities: NormalizedActivity[]) {
  const groups: Array<{
    key: string;
    activity: NormalizedActivity;
    links: ReturnType<typeof uniqueActivitySourceLinks>;
    sourceIds: string[];
    stableKeys: string[];
    count: number;
  }> = [];

  for (const item of activities) {
    const key = importTaskKey(item);
    const group = groups.find(
      (candidate) =>
        candidate.key === key ||
        isDuplicateImportTask(candidate.activity, item),
    );
    const sourceLink = sourceLinkForActivity(item);

    if (!group) {
      groups.push({
        key,
        activity: { ...item },
        links: uniqueActivitySourceLinks([sourceLink]),
        sourceIds: [item.sourceId],
        stableKeys: stableImportKeys(item),
        count: 1,
      });
      continue;
    }

    group.count += 1;
    group.sourceIds.push(item.sourceId);
    group.stableKeys.push(...stableImportKeys(item));
    group.links = uniqueActivitySourceLinks([...group.links, sourceLink]);
    group.activity = {
      ...group.activity,
      description: group.activity.description ?? item.description,
      status: group.activity.status ?? item.status,
      sourceUrl: group.activity.sourceUrl ?? item.sourceUrl,
      startedAt: earliestDate(group.activity.startedAt, item.startedAt),
      endedAt: latestDate(group.activity.endedAt, item.endedAt),
      durationMinutes: summedDuration(
        group.activity.durationMinutes,
        item.durationMinutes,
      ),
      selected:
        group.activity.selected === false && item.selected === false
          ? false
          : true,
      metadata: mergedMetadata(group.activity.metadata, item.metadata),
    };
  }

  return groups.map((group) => {
    if (group.count === 1) {
      return group.activity;
    }

    const metadata = {
      ...(group.activity.metadata ?? {}),
      mergedSourceIds: [...new Set(group.sourceIds)].sort(),
    };

    return {
      ...group.activity,
      sourceId: mergedSourceId(group.activity.source, mergedImportKey(group)),
      metadata: metadataWithRelatedSourceLinks(
        metadata as Prisma.JsonValue,
        group.links,
      ) as Record<string, unknown>,
    };
  });
}

function relatedActivityLinks(item: NormalizedActivity) {
  return uniqueActivitySourceLinks([
    sourceLinkForActivity(item),
    ...relatedSourceLinksFromMetadata(item.metadata),
  ]);
}

export async function upsertImportedActivities(
  source: ImportedActivitySource,
  userId: string,
  dateString: string,
  activities: NormalizedActivity[],
) {
  const reportDate = parseReportDate(dateString);
  let importedCount = 0;
  let skippedCount = 0;
  const importedSourceIds = new Set<string>();
  const relatedActivities: NormalizedActivity[] = [];
  const rawImportableActivities: NormalizedActivity[] = [];

  for (const item of activities) {
    if (!item.sourceId || item.source !== source) {
      skippedCount += 1;
      continue;
    }

    if (relatedActivityIdFromMetadata(item.metadata)) {
      relatedActivities.push(item);
      continue;
    }

    rawImportableActivities.push(item);
  }

  const importableActivities = mergeDuplicateImportActivities(
    rawImportableActivities,
  );

  for (const item of importableActivities) {
    importedSourceIds.add(item.sourceId);
  }

  const existingImports: ExistingImportedActivity[] = importedSourceIds.size
    ? await prisma.activityItem.findMany({
        where: {
          userId,
          reportDate,
          source,
          sourceId: { in: [...importedSourceIds] },
        },
        select: {
          id: true,
          dailyReportId: true,
          sourceId: true,
          sourceContainerId: true,
          title: true,
          description: true,
          status: true,
          sourceUrl: true,
          startedAt: true,
          endedAt: true,
          durationMinutes: true,
          selected: true,
          metadata: true,
          staleAt: true,
        },
      })
    : [];
  const existingBySourceId = new Map(
    existingImports.flatMap((activity) =>
      activity.sourceId ? [[activity.sourceId, activity]] : [],
    ),
  );

  const staleCandidates = await prisma.activityItem.findMany({
    where: {
      userId,
      reportDate,
      source,
      staleAt: null,
      sourceId:
        importedSourceIds.size > 0
          ? { notIn: [...importedSourceIds] }
          : { not: null },
    },
    select: {
      id: true,
      metadata: true,
    },
  });
  const staleIds = staleCandidates
    .filter(
      (activity) =>
        !(
          source === "GOOGLE_TASKS" &&
          isManualGoogleTaskReference(activity.metadata)
        ),
    )
    .map((activity) => activity.id);
  const shouldPersistDraft =
    importableActivities.length > 0 ||
    relatedActivities.length > 0 ||
    staleIds.length > 0;
  const report: ImportedDraftReport | null = shouldPersistDraft
    ? await prisma.dailyReport.upsert({
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
        select: importedDraftReportSelect,
      })
    : null;

  const activitiesToCreate: Prisma.ActivityItemCreateManyInput[] = [];
  const activitiesToUpdate: Array<{
    id: string;
    data: ReturnType<typeof importedActivityData>;
  }> = [];

  if (report) {
    const relatedActivityIds = [
      ...new Set(
        relatedActivities
          .map((activity) => relatedActivityIdFromMetadata(activity.metadata))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const relatedTargets: RelatedActivityTarget[] = relatedActivityIds.length
      ? await prisma.activityItem.findMany({
          where: {
            id: { in: relatedActivityIds },
            userId,
            reportDate,
            staleAt: null,
          },
          select: {
            id: true,
            dailyReportId: true,
            metadata: true,
          },
        })
      : [];
    const relatedTargetById = new Map(
      relatedTargets.map((activity) => [activity.id, activity]),
    );

    for (const item of relatedActivities) {
      const relatedActivityId = relatedActivityIdFromMetadata(item.metadata);
      const target = relatedActivityId
        ? relatedTargetById.get(relatedActivityId)
        : null;
      const links = relatedActivityLinks(item);

      if (!target || links.length === 0) {
        skippedCount += 1;
        continue;
      }

      const metadata = metadataWithRelatedSourceLinks(target.metadata, links);

      await prisma.activityItem.update({
        where: { id: target.id },
        data: {
          dailyReportId: target.dailyReportId ?? report.id,
          metadata,
        },
      });
      target.dailyReportId = target.dailyReportId ?? report.id;
      target.metadata = metadata as Prisma.JsonValue;
      importedCount += 1;
    }

    for (const item of importableActivities) {
      const existingActivity = existingBySourceId.get(item.sourceId);
      const data = importedActivityData(item, existingActivity);

      if (!existingActivity) {
        activitiesToCreate.push({
          userId,
          dailyReportId: report.id,
          reportDate,
          source: item.source,
          sourceId: item.sourceId,
          ...data,
        });
        importedCount += 1;
        continue;
      }

      if (importedActivityChanged(existingActivity, data, report.id)) {
        activitiesToUpdate.push({
          id: existingActivity.id,
          data,
        });
      }

      importedCount += 1;
    }
  }

  if (activitiesToCreate.length) {
    await prisma.activityItem.createMany({
      data: activitiesToCreate,
      skipDuplicates: true,
    });
  }

  for (const activity of activitiesToUpdate) {
    await prisma.activityItem.update({
      where: { id: activity.id },
      data: {
        ...activity.data,
        dailyReportId: report?.id,
      },
    });
  }

  const staleResult = staleIds.length
    ? await prisma.activityItem.updateMany({
        where: {
          id: { in: staleIds },
        },
        data: {
          staleAt: new Date(),
        },
      })
    : { count: 0 };

  const importedActivities = await prisma.activityItem.findMany({
    where: {
      userId,
      reportDate,
      source,
      staleAt: null,
    },
    orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
  });

  return {
    importedCount,
    skippedCount,
    staleCount: staleResult.count,
    activities: importedActivities,
    ...(report ? { report } : {}),
  };
}
