import crypto from "crypto";
import type { Prisma } from "@prisma/client";

import { parseReportDate } from "@/lib/dates";
import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { updateReportSchema } from "@/lib/validation";
import type { z } from "zod";

type UpdateReportInput = z.infer<typeof updateReportSchema>;

function extractBlockerLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*blockers?:\s*(.+?)\s*$/i)?.[1]?.trim())
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

const reportInclude = {
  user: true,
  activities: {
    orderBy: [{ startedAt: "asc" as const }, { createdAt: "asc" as const }]
  },
  comments: {
    include: { author: true },
    orderBy: { createdAt: "asc" as const }
  },
  readReceipts: {
    select: {
      reviewerId: true,
      readAt: true
    }
  },
  revisions: {
    include: { editedBy: true },
    orderBy: { createdAt: "desc" as const }
  }
};

export async function ensureDailyReport(userId: string, dateString: string) {
  const reportDate = parseReportDate(dateString);

  return prisma.dailyReport.upsert({
    where: {
      userId_reportDate: {
        userId,
        reportDate
      }
    },
    update: {},
    create: {
      userId,
      reportDate
    }
  });
}

export async function getDailyReport(userId: string, dateString: string) {
  const reportDate = parseReportDate(dateString);

  return prisma.dailyReport.findUnique({
    where: {
      userId_reportDate: {
        userId,
        reportDate
      }
    },
    include: reportInclude
  });
}

export async function getReportById(reportId: string) {
  const report = await prisma.dailyReport.findUnique({
    where: { id: reportId },
    include: reportInclude
  });

  if (!report) {
    throw new HttpError(404, "Report not found.");
  }

  return report;
}

async function createRevision(reportId: string, editedById: string) {
  const report = await prisma.dailyReport.findUnique({
    where: { id: reportId },
    include: { activities: true }
  });

  if (!report || report.status !== "SUBMITTED") {
    return;
  }

  await prisma.reportRevision.create({
    data: {
      reportId,
      editedById,
      snapshot: {
        report: {
          workLocation: report.workLocation,
          summary: report.summary,
          blockers: report.blockers,
          status: report.status,
          submittedAt: report.submittedAt?.toISOString()
        },
        activities: report.activities.map((activity) => ({
          id: activity.id,
          selected: activity.selected,
          employeeNote: activity.employeeNote
        }))
      } as Prisma.InputJsonValue
    }
  });
}

export async function updateReport(reportId: string, editedById: string, input: UpdateReportInput) {
  const report = await getReportById(reportId);

  await createRevision(report.id, editedById);

  await prisma.$transaction(async (tx) => {
    await tx.dailyReport.update({
      where: { id: report.id },
      data: {
        summary: input.summary,
        blockers: input.summary === undefined ? input.blockers : extractBlockerLines(input.summary),
        workLocation: input.workLocation
      }
    });

    for (const activity of input.activityUpdates ?? []) {
      await tx.activityItem.updateMany({
        where: { id: activity.id, userId: report.userId, reportDate: report.reportDate },
        data: {
          dailyReportId: report.id,
          selected: activity.selected,
          employeeNote: activity.employeeNote === undefined ? undefined : activity.employeeNote
        }
      });
    }

    if (input.deletedActivityIds?.length) {
      await tx.activityItem.deleteMany({
        where: {
          id: { in: input.deletedActivityIds },
          userId: report.userId,
          dailyReportId: report.id,
          source: "MANUAL"
        }
      });
    }

    for (const manual of input.manualActivities ?? []) {
      await tx.activityItem.create({
        data: {
          userId: report.userId,
          dailyReportId: report.id,
          reportDate: report.reportDate,
          source: "MANUAL",
          sourceId: `manual:${crypto.randomUUID()}`,
          title: manual.title,
          description: manual.description ?? null,
          status: manual.status ?? "noted",
          durationMinutes: manual.durationMinutes ?? null,
          startedAt: manual.startedAt ? new Date(manual.startedAt) : null,
          endedAt: manual.endedAt ? new Date(manual.endedAt) : null,
          employeeNote: manual.employeeNote ?? null
        }
      });
    }
  });

  return getReportById(report.id);
}

export async function submitReport(reportId: string, editedById: string) {
  const report = await getReportById(reportId);

  if (report.status === "SUBMITTED") {
    return report;
  }

  await createRevision(report.id, editedById);

  await prisma.dailyReport.update({
    where: { id: report.id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date()
    }
  });

  return getReportById(reportId);
}

export async function deleteDraftReport(reportId: string) {
  const report = await getReportById(reportId);

  if (report.status !== "DRAFT") {
    throw new HttpError(400, "Submitted reports cannot be deleted.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.activityItem.deleteMany({
      where: {
        dailyReportId: report.id
      }
    });

    await tx.dailyReport.delete({
      where: {
        id: report.id
      }
    });
  });

  return { ok: true };
}

export async function addReportComment(reportId: string, authorId: string, body: string) {
  await prisma.reportComment.create({
    data: {
      reportId,
      authorId,
      body
    }
  });

  return getReportById(reportId);
}

export async function setReportReadState(reportId: string, reviewerId: string, read: boolean) {
  await getReportById(reportId);

  if (!read) {
    await prisma.reportReadReceipt.deleteMany({
      where: {
        reportId,
        reviewerId
      }
    });

    return getReportById(reportId);
  }

  await prisma.reportReadReceipt.upsert({
    where: {
      reportId_reviewerId: {
        reportId,
        reviewerId
      }
    },
    update: {
      readAt: new Date()
    },
    create: {
      reportId,
      reviewerId
    }
  });

  return getReportById(reportId);
}

export async function listReportsForDate(dateString: string) {
  const reportDate = parseReportDate(dateString);

  const users = await prisma.user.findMany({
    where: { role: "EMPLOYEE", status: { not: "DISABLED" } },
    orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
    include: {
      reports: {
        where: { reportDate },
        include: reportInclude
      }
    }
  });

  return users.map((user) => ({
    user,
    report: user.reports[0] ?? null
  }));
}

export async function listReportHistory(userId: string, limit = 30) {
  return prisma.dailyReport.findMany({
    where: { userId },
    orderBy: { reportDate: "desc" },
    take: limit,
    include: {
      activities: {
        where: { selected: true },
        orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          source: true,
          title: true,
          status: true,
          durationMinutes: true,
          employeeNote: true,
          sourceUrl: true
        }
      },
      comments: {
        include: { author: true },
        orderBy: { createdAt: "asc" }
      },
      revisions: {
        include: { editedBy: true },
        orderBy: { createdAt: "desc" }
      }
    }
  });
}

export async function getDashboardMetrics(dateString: string) {
  const reportDate = parseReportDate(dateString);
  const trendStart = new Date(reportDate);
  trendStart.setUTCDate(trendStart.getUTCDate() - 6);
  const employeeWhere = { role: "EMPLOYEE" as const, status: { not: "DISABLED" as const } };
  const users = await prisma.user.count({ where: employeeWhere });
  const submitted = await prisma.dailyReport.count({ where: { reportDate, status: "SUBMITTED", user: employeeWhere } });
  const activities = await prisma.activityItem.groupBy({
    by: ["source"],
    where: { reportDate, selected: true, user: employeeWhere },
    _count: true
  });
  const blockers = await prisma.dailyReport.count({
    where: {
      reportDate,
      blockers: { not: "" },
      user: employeeWhere
    }
  });
  const blockerTrendRows = await prisma.dailyReport.groupBy({
    by: ["reportDate"],
    where: {
      reportDate: {
        gte: trendStart,
        lte: reportDate
      },
      blockers: { not: "" },
      user: employeeWhere
    },
    _count: true
  });
  const blockerCounts = new Map(blockerTrendRows.map((row) => [row.reportDate.toISOString().slice(0, 10), row._count]));
  const blockerTrend = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(trendStart);
    day.setUTCDate(trendStart.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);

    return {
      date,
      count: blockerCounts.get(date) ?? 0
    };
  });

  return {
    users,
    submitted,
    blockers,
    blockerTrend,
    sourceMix: activities.map((activity) => ({
      source: activity.source,
      count: activity._count
    }))
  };
}
