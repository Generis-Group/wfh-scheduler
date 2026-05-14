import type { Prisma } from "@prisma/client";

import { parseReportDate } from "@/lib/dates";
import type { NormalizedActivity } from "@/lib/normalizers/types";
import { prisma } from "@/lib/prisma";
import { ensureDailyReport } from "@/lib/services/reports";

function metadataJson(metadata: NormalizedActivity["metadata"]) {
  return metadata ? (JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue) : undefined;
}

export async function listActivities(userId: string, dateString: string) {
  return prisma.activityItem.findMany({
    where: {
      userId,
      reportDate: parseReportDate(dateString)
    },
    orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }]
  });
}

export async function upsertImportedActivities(
  userId: string,
  dateString: string,
  activities: NormalizedActivity[]
) {
  const report = await ensureDailyReport(userId, dateString);
  const reportDate = parseReportDate(dateString);

  let importedCount = 0;
  let skippedCount = 0;

  for (const item of activities) {
    if (!item.sourceId) {
      skippedCount += 1;
      continue;
    }

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
        dailyReportId: report.id,
        sourceContainerId: item.sourceContainerId ?? null,
        title: item.title,
        description: item.description ?? null,
        status: item.status ?? null,
        sourceUrl: item.sourceUrl ?? null,
        startedAt: item.startedAt ?? null,
        endedAt: item.endedAt ?? null,
        durationMinutes: item.durationMinutes ?? null,
        metadata: metadataJson(item.metadata)
      },
      create: {
        userId,
        dailyReportId: report.id,
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
        metadata: metadataJson(item.metadata)
      }
    });

    importedCount += 1;
  }

  return { importedCount, skippedCount };
}
