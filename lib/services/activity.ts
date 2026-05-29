import type { ActivitySource, Prisma } from "@prisma/client";

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

type ExistingImportedActivity = {
  id: string;
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
    selected: true,
    staleAt: null,
  };
}

function importedActivityChanged(
  existing: ExistingImportedActivity,
  data: ReturnType<typeof importedActivityData>,
) {
  return (
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
  const importableActivities: NormalizedActivity[] = [];

  for (const item of activities) {
    if (!item.sourceId || item.source !== source) {
      skippedCount += 1;
      continue;
    }

    importedSourceIds.add(item.sourceId);
    importableActivities.push(item);
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

  const activitiesToCreate: Prisma.ActivityItemCreateManyInput[] = [];
  const activitiesToUpdate: Array<{
    id: string;
    data: ReturnType<typeof importedActivityData>;
  }> = [];

  for (const item of importableActivities) {
    const existingActivity = existingBySourceId.get(item.sourceId);
    const data = importedActivityData(item, existingActivity);

    if (!existingActivity) {
      activitiesToCreate.push({
        userId,
        reportDate,
        source: item.source,
        sourceId: item.sourceId,
        ...data,
      });
      importedCount += 1;
      continue;
    }

    if (importedActivityChanged(existingActivity, data)) {
      activitiesToUpdate.push({
        id: existingActivity.id,
        data,
      });
    }

    importedCount += 1;
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
      data: activity.data,
    });
  }

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
  };
}
