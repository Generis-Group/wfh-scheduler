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
      (metadata as { manuallyAdded?: unknown }).manuallyAdded === true
  );
}

export async function listActivities(userId: string, dateString: string) {
  return prisma.activityItem.findMany({
    where: {
      userId,
      reportDate: parseReportDate(dateString),
      staleAt: null
    },
    orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }]
  });
}

type ImportedActivitySource = Exclude<ActivitySource, "MANUAL">;

export async function upsertImportedActivities(
  source: ImportedActivitySource,
  userId: string,
  dateString: string,
  activities: NormalizedActivity[]
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

  const existingImports = importedSourceIds.size
    ? await prisma.activityItem.findMany({
        where: {
          userId,
          reportDate,
          source,
          sourceId: { in: [...importedSourceIds] }
        },
        select: {
          sourceId: true,
          title: true,
          metadata: true
        }
      })
    : [];
  const existingBySourceId = new Map(
    existingImports.flatMap((activity) =>
      activity.sourceId ? [[activity.sourceId, activity]] : []
    )
  );

  for (const item of importableActivities) {
    const existingActivity = existingBySourceId.get(item.sourceId);
    const title = importedActivityTitle(item.title, existingActivity);
    const metadata = importedActivityMetadata(
      item.metadata,
      item.title,
      existingActivity
    );

    await prisma.activityItem.upsert({
      where: {
        userId_reportDate_source_sourceId: {
          userId,
          reportDate,
          source: item.source,
          sourceId: item.sourceId
        }
      },
      update: {
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
        staleAt: null
      },
      create: {
        userId,
        reportDate,
        source: item.source,
        sourceId: item.sourceId,
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
        staleAt: null
      }
    });

    importedCount += 1;
  }

  const staleCandidates = await prisma.activityItem.findMany({
    where: {
      userId,
      reportDate,
      source,
      staleAt: null,
      sourceId: importedSourceIds.size > 0 ? { notIn: [...importedSourceIds] } : { not: null }
    },
    select: {
      id: true,
      metadata: true
    }
  });
  const staleIds = staleCandidates
    .filter((activity) => !(source === "GOOGLE_TASKS" && isManualGoogleTaskReference(activity.metadata)))
    .map((activity) => activity.id);

  const staleResult = staleIds.length
    ? await prisma.activityItem.updateMany({
        where: {
          id: { in: staleIds }
        },
        data: {
          staleAt: new Date()
        }
      })
    : { count: 0 };

  const importedActivities = await prisma.activityItem.findMany({
    where: {
      userId,
      reportDate,
      source,
      staleAt: null
    },
    orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }]
  });

  return { importedCount, skippedCount, staleCount: staleResult.count, activities: importedActivities };
}
