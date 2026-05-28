import crypto from "crypto";
import type { Prisma } from "@prisma/client";

import { activityMetadataWithLocalTitleState } from "@/lib/activity-title-overrides";
import { addReportDateDays, parseReportDate } from "@/lib/dates";
import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { departmentMembershipSelect, getReviewableEmployeeWhere, type ReviewScope } from "@/lib/services/departments";
import type { updateReportSchema } from "@/lib/validation";
import type { z } from "zod";

type UpdateReportInput = z.infer<typeof updateReportSchema>;
type ActivityUpdateInput = NonNullable<UpdateReportInput["activityUpdates"]>[number];
type ExistingActivityUpdate = {
  id: string;
  dailyReportId: string | null;
  title: string;
  selected: boolean;
  employeeNote: string | null;
  metadata: Prisma.JsonValue | null;
};
type ChangedActivityUpdate = {
  input: ActivityUpdateInput;
  existing: ExistingActivityUpdate;
};

const userIdentitySelect = {
  id: true,
  name: true,
  email: true
};

const reportUserSelect = {
  ...userIdentitySelect,
  role: true,
  status: true,
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

const reportHistoryInclude = {
  user: {
    select: reportUserSelect
  },
  activities: {
    where: { selected: true, staleAt: null },
    orderBy: [{ startedAt: "asc" as const }, { createdAt: "asc" as const }],
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

  const report = await prisma.dailyReport.findUnique({
    where: {
      userId_reportDate: {
        userId,
        reportDate
      }
    },
    select: {
      ...editorReportSelect,
      activities: {
        where: { staleAt: null },
        orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
        select: reportActivitySelect
      }
    }
  });

  return {
    report,
    activities: report?.activities ?? []
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

export async function createReportRevision(reportId: string, editedById: string) {
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

function reportFieldChanges(report: Awaited<ReturnType<typeof getReportById>>, input: UpdateReportInput) {
  return {
    summary: input.summary !== undefined && input.summary !== report.summary,
    workLocation: input.workLocation !== undefined && input.workLocation !== report.workLocation
  };
}

async function changedActivityUpdates(
  report: Awaited<ReturnType<typeof getReportById>>,
  activityUpdates: ActivityUpdateInput[]
): Promise<ChangedActivityUpdate[]> {
  if (activityUpdates.length === 0) {
    return [];
  }

  const existingActivities = await prisma.activityItem.findMany({
    where: {
      id: { in: activityUpdates.map((activity) => activity.id) },
      userId: report.userId,
      reportDate: report.reportDate,
      staleAt: null
    },
    select: {
      id: true,
      dailyReportId: true,
      title: true,
      selected: true,
      employeeNote: true,
      metadata: true
    }
  });
  const existingById = new Map(existingActivities.map((activity) => [activity.id, activity]));

  return activityUpdates.flatMap((activity) => {
    const existing = existingById.get(activity.id);

    if (!existing) {
      return [];
    }

    const changed =
      existing.dailyReportId !== report.id ||
      (activity.title !== undefined && activity.title !== existing.title) ||
      (activity.selected !== undefined && activity.selected !== existing.selected) ||
      (activity.employeeNote !== undefined && activity.employeeNote !== existing.employeeNote);

    return changed ? [{ input: activity, existing }] : [];
  });
}

export async function updateReport(reportId: string, editedById: string, input: UpdateReportInput) {
  const report = await getReportById(reportId);
  const activityUpdates = await changedActivityUpdates(report, input.activityUpdates ?? []);
  const fieldChanges = reportFieldChanges(report, input);
  const hasFieldChanges = Object.values(fieldChanges).some(Boolean);
  const hasActivityChanges = activityUpdates.length > 0;
  const hasDeletedActivities = Boolean(input.deletedActivityIds?.length);
  const hasManualActivities = Boolean(input.manualActivities?.length);

  if (!hasFieldChanges && !hasActivityChanges && !hasDeletedActivities && !hasManualActivities) {
    return report;
  }

  await createReportRevision(report.id, editedById);

  await prisma.$transaction(async (tx) => {
    const reportData: Prisma.DailyReportUpdateInput = {};

    if (fieldChanges.summary) {
      reportData.summary = input.summary;
    }

    if (fieldChanges.workLocation) {
      reportData.workLocation = input.workLocation;
    }

    if (!hasFieldChanges) {
      reportData.updatedAt = new Date();
    }

    await tx.dailyReport.update({
      where: { id: report.id },
      data: reportData
    });

    for (const { input: activity, existing } of activityUpdates) {
      const titleChanged = activity.title !== undefined && activity.title !== existing.title;

      await tx.activityItem.updateMany({
        where: { id: activity.id, userId: report.userId, reportDate: report.reportDate, staleAt: null },
        data: {
          dailyReportId: report.id,
          title: titleChanged ? activity.title : undefined,
          selected: activity.selected,
          employeeNote: activity.employeeNote === undefined ? undefined : activity.employeeNote,
          metadata: titleChanged
            ? activityMetadataWithLocalTitleState(
                existing.metadata,
                activity.title!
              )
            : undefined
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
    await prisma.dailyReport.update({
      where: { id: report.id },
      data: {
        submittedAt: new Date()
      }
    });

    return getReportById(reportId);
  }

  await createReportRevision(report.id, editedById);

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
  const { users, reports } = await prisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({
      where: employeeWhere,
      orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
      select: dashboardUserSelect
    });
    const reports = await tx.dailyReport.findMany({
      where: {
        reportDate,
        user: employeeWhere
      },
      include: dashboardReportInclude(scope)
    });

    return { users, reports };
  });
  const reportsByUserId = new Map(reports.map((report) => [report.userId, report]));

  return users.map((user) => ({
    user,
    report: reportsByUserId.get(user.id) ?? null
  }));
}

export async function getReviewDashboardData(dateString: string, scope?: ReviewScope) {
  const reportDate = parseReportDate(dateString);
  const employeeWhere = await getReviewableEmployeeWhere(scope);
  const rows = await listReportsForDateForWhere(reportDate, employeeWhere, scope);
  const metrics = await getDashboardMetricsForWhere(reportDate, employeeWhere);

  return { rows, metrics };
}

export function reportWorkWeekRange(dateString: string) {
  const date = parseReportDate(dateString);
  const weekday = date.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = addReportDateDays(dateString, mondayOffset);
  const end = addReportDateDays(start, 4);

  return { start, end };
}

export async function getWeeklyReportForEmployee(
  employeeId: string,
  dateString: string,
  scope: ReviewScope,
) {
  const { start, end } = reportWorkWeekRange(dateString);
  const employeeWhere = await getReviewableEmployeeWhere(scope);
  const startDate = parseReportDate(start);
  const endDate = parseReportDate(end);
  const { employee, reports } = await prisma.$transaction(async (tx) => {
    const employee = await tx.user.findFirst({
      where: {
        ...employeeWhere,
        id: employeeId,
      },
      select: dashboardUserSelect,
    });

    if (!employee) {
      return { employee: null, reports: [] };
    }

    const reports = await tx.dailyReport.findMany({
      where: {
        userId: employeeId,
        status: "SUBMITTED",
        reportDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { reportDate: "asc" },
      include: dashboardReportInclude(scope),
    });

    return { employee, reports };
  });

  if (!employee) {
    throw new HttpError(404, "Employee not found.");
  }

  return {
    employee,
    weekStart: start,
    weekEnd: end,
    reports,
  };
}

export async function listReportHistory(userId: string, limit = 30, targetReportId?: string | null) {
  const reports = await prisma.dailyReport.findMany({
    where: { userId },
    orderBy: { reportDate: "desc" },
    take: limit,
    include: reportHistoryInclude
  });

  if (!targetReportId || reports.some((report) => report.id === targetReportId)) {
    return reports;
  }

  const targetReport = await prisma.dailyReport.findFirst({
    where: { id: targetReportId, userId },
    include: reportHistoryInclude
  });

  return targetReport ? [targetReport, ...reports] : reports;
}

async function getDashboardMetricsForWhere(reportDate: Date, employeeWhere: Prisma.UserWhereInput) {
  const { users, submitted, activities } = await prisma.$transaction(async (tx) => {
    const users = await tx.user.count({ where: employeeWhere });
    const submitted = await tx.dailyReport.count({ where: { reportDate, status: "SUBMITTED", user: employeeWhere } });
    const activities = await tx.activityItem.groupBy({
      by: ["source"],
      where: { reportDate, selected: true, staleAt: null, user: employeeWhere },
      _count: true
    });

    return { users, submitted, activities };
  });

  return {
    users,
    submitted,
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
