import type { ActivitySource, Prisma } from "@prisma/client";

import { parseReportDate } from "@/lib/dates";
import type { NormalizedActivity } from "@/lib/normalizers/types";
import { prisma } from "@/lib/prisma";

function metadataJson(metadata: NormalizedActivity["metadata"]) {
  return metadata ? (JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue) : undefined;
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

  for (const item of activities) {
    if (!item.sourceId || item.source !== source) {
      skippedCount += 1;
      continue;
    }

    importedSourceIds.add(item.sourceId);

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
        title: item.title,
        description: item.description ?? null,
        status: item.status ?? null,
        sourceUrl: item.sourceUrl ?? null,
        startedAt: item.startedAt ?? null,
        endedAt: item.endedAt ?? null,
        durationMinutes: item.durationMinutes ?? null,
        metadata: metadataJson(item.metadata),
        staleAt: null
      },
      create: {
        userId,
        reportDate,
        source: item.source,
        sourceId: item.sourceId,
        sourceContainerId: item.sourceContainerId ?? null,
        title: item.title,
        description: item.description ?? null,
        status: item.status ?? null,
        sourceUrl: item.sourceUrl ?? null,
        startedAt: item.startedAt ?? null,
        endedAt: item.endedAt ?? null,
        durationMinutes: item.durationMinutes ?? null,
        metadata: metadataJson(item.metadata),
        staleAt: null
      }
    });

    importedCount += 1;
  }

  const staleResult = await prisma.activityItem.updateMany({
    where: {
      userId,
      reportDate,
      source,
      staleAt: null,
      sourceId: importedSourceIds.size > 0 ? { notIn: [...importedSourceIds] } : { not: null }
    },
    data: {
      staleAt: new Date()
    }
  });

  const importedActivities = importedSourceIds.size
    ? await prisma.activityItem.findMany({
        where: {
          userId,
          reportDate,
          source,
          staleAt: null,
          sourceId: { in: [...importedSourceIds] }
        },
        orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }]
      })
    : [];

  return { importedCount, skippedCount, staleCount: staleResult.count, activities: importedActivities };
}
