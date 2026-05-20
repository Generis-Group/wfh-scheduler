import crypto from "crypto";
import type { Prisma } from "@prisma/client";

import { parseReportDate } from "@/lib/dates";
import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { departmentMembershipSelect, getReviewableEmployeeWhere, type ReviewScope } from "@/lib/services/departments";
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

const userIdentitySelect = {
  id: true,
  name: true,
  email: true
};

const reportUserSelect = {
  ...userIdentitySelect,
  role: true,
  status: true,
  timezone: true,
  ...departmentMembershipSelect
};

const dashboardUserSelect = {
  ...userIdentitySelect,
  role: true,
  status: true,
  ...departmentMembershipSelect
};

const reportActivitySelect = {
  id: true,
  source: true,
  title: true,
  description: true,
  status: true,
  sourceUrl: true,
  startedAt: true,
  endedAt: true,
  durationMinutes: true,
  selected: true,
  employeeNote: true
};

const editorReportSelect = {
  id: true,
  userId: true,
  reportDate: true,
  workLocation: true,
  summary: true,
  blockers: true,
  status: true,
  submittedAt: true,
  updatedAt: true
};

const reportInclude = {
  user: {
    select: reportUserSelect
  },
  activities: {
    where: { staleAt: null },
    orderBy: [{ startedAt: "asc" as const }, { createdAt: "asc" as const }],
    select: reportActivitySelect
  },
  comments: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: {
        select: userIdentitySelect
      }
    }
  },
  readReceipts: {
    select: {
      reviewerId: true,
      readAt: true
    }
  },
  revisions: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      createdAt: true,
      editedBy: {
        select: userIdentitySelect
      }
    }
  }
};

function dashboardReportInclude(scope?: ReviewScope) {
  return {
    activities: {
      where: { staleAt: null },
      orderBy: [{ startedAt: "asc" as const }, { createdAt: "asc" as const }],
      select: {
        id: true,
        title: true,
        source: true,
        selected: true,
        status: true,
        durationMinutes: true,
        employeeNote: true,
        sourceUrl: true
      }
    },
    comments: {
      orderBy: { createdAt: "asc" as const },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: {
          select: userIdentitySelect
        }
      }
    },
    readReceipts: {
      ...(scope ? { where: { reviewerId: scope.userId } } : {}),
      select: {
        reviewerId: true,
        readAt: true
      }
    },
    revisions: {
      orderBy: { createdAt: "desc" as const },
      select: {
        id: true,
        createdAt: true,
        editedBy: {
          select: userIdentitySelect
        }
      }
    }
  };
}

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

export async function getDailyReportEditorData(userId: string, dateString: string) {
  const reportDate = parseReportDate(dateString);

  const [report, activities] = await Promise.all([
    prisma.dailyReport.findUnique({
      where: {
        userId_reportDate: {
          userId,
          reportDate
        }
      },
      select: editorReportSelect
    }),
    prisma.activityItem.findMany({
      where: {
        userId,
        reportDate,
        staleAt: null
      },
      orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
      select: reportActivitySelect
    })
  ]);

  return {
    report: report ? { ...report, activities } : null,
    activities
  };
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
    include: { activities: { where: { staleAt: null } } }
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
        blockers: input.blockers !== undefined ? input.blockers : input.summary === undefined ? undefined : extractBlockerLines(input.summary),
        workLocation: input.workLocation
      }
    });

    for (const activity of input.activityUpdates ?? []) {
      await tx.activityItem.updateMany({
        where: { id: activity.id, userId: report.userId, reportDate: report.reportDate, staleAt: null },
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

export async function listReportsForDate(dateString: string, scope?: ReviewScope) {
  const reportDate = parseReportDate(dateString);
  const employeeWhere = await getReviewableEmployeeWhere(scope);

  return listReportsForDateForWhere(reportDate, employeeWhere, scope);
}

async function listReportsForDateForWhere(reportDate: Date, employeeWhere: Prisma.UserWhereInput, scope?: ReviewScope) {
  const [users, reports] = await Promise.all([
    prisma.user.findMany({
      where: employeeWhere,
      orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
      select: dashboardUserSelect
    }),
    prisma.dailyReport.findMany({
      where: {
        reportDate,
        user: employeeWhere
      },
      include: dashboardReportInclude(scope)
    })
  ]);
  const reportsByUserId = new Map(reports.map((report) => [report.userId, report]));

  return users.map((user) => ({
    user,
    report: reportsByUserId.get(user.id) ?? null
  }));
}

export async function getReviewDashboardData(dateString: string, scope?: ReviewScope) {
  const reportDate = parseReportDate(dateString);
  const employeeWhere = await getReviewableEmployeeWhere(scope);
  const [rows, metrics] = await Promise.all([
    listReportsForDateForWhere(reportDate, employeeWhere, scope),
    getDashboardMetricsForWhere(reportDate, employeeWhere)
  ]);

  return { rows, metrics };
}

export async function listReportHistory(userId: string, limit = 30) {
  return prisma.dailyReport.findMany({
    where: { userId },
    orderBy: { reportDate: "desc" },
    take: limit,
    include: {
      user: {
        select: reportUserSelect
      },
      activities: {
        where: { selected: true, staleAt: null },
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
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: {
            select: userIdentitySelect
          }
        }
      },
      revisions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          editedBy: {
            select: userIdentitySelect
          }
        }
      }
    }
  });
}

async function getDashboardMetricsForWhere(reportDate: Date, employeeWhere: Prisma.UserWhereInput) {
  const trendStart = new Date(reportDate);
  trendStart.setUTCDate(trendStart.getUTCDate() - 6);

  const [users, submitted, activities, blockers, blockerTrendRows] = await Promise.all([
    prisma.user.count({ where: employeeWhere }),
    prisma.dailyReport.count({ where: { reportDate, status: "SUBMITTED", user: employeeWhere } }),
    prisma.activityItem.groupBy({
      by: ["source"],
      where: { reportDate, selected: true, staleAt: null, user: employeeWhere },
      _count: true
    }),
    prisma.dailyReport.count({
      where: {
        reportDate,
        blockers: { not: "" },
        user: employeeWhere
      }
    }),
    prisma.dailyReport.groupBy({
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
    })
  ]);
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

export async function getDashboardMetrics(dateString: string, scope?: ReviewScope) {
  const reportDate = parseReportDate(dateString);
  const employeeWhere = await getReviewableEmployeeWhere(scope);

  return getDashboardMetricsForWhere(reportDate, employeeWhere);
}
