import type { Prisma, UserRole } from "@prisma/client";

import { addReportDateDays, parseReportDate } from "@/lib/dates";
import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { hasUserRole } from "@/lib/roles";
import {
  departmentMembershipSelect,
  type ReviewScope,
} from "@/lib/services/departments";
import { reportWorkWeekRange } from "@/lib/services/reports";
import {
  isPlannedWorkLocation,
  normalizePlannedWorkLocationValue,
  normalizeWorkLocationValue,
  type PlannedWorkLocationValue,
  type WorkLocationValue,
} from "@/lib/work-locations";

const calendarUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  roles: true,
  status: true,
  ...departmentMembershipSelect,
};

function dateToString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function weekDates(start: string, end: string) {
  const dates: string[] = [];
  let cursor = start;

  while (cursor <= end) {
    dates.push(cursor);
    cursor = addReportDateDays(cursor, 1);
  }

  return dates;
}

function monthDateRange(dateString: string) {
  const date = parseReportDate(dateString);
  const monthStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  );
  const monthEnd = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  );

  return {
    start: dateToString(monthStart),
    end: dateToString(monthEnd),
  };
}

function calendarMonthDates(monthStart: string) {
  const firstOfMonth = parseReportDate(monthStart);
  const firstWeekday = firstOfMonth.getUTCDay();
  const gridStart = addReportDateDays(monthStart, -firstWeekday);
  const monthKey = monthStart.slice(0, 7);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addReportDateDays(gridStart, index);

    return {
      date,
      inCurrentMonth: date.slice(0, 7) === monthKey,
    };
  });
}

function calendarDaysForUser({
  userId,
  dates,
  reportsByUserDate,
  plansByUserDate,
}: {
  userId: string;
  dates: string[];
  reportsByUserDate: Map<
    string,
    { id: string; workLocation: WorkLocationValue | null }
  >;
  plansByUserDate: Map<string, { workLocation: WorkLocationValue | null }>;
}) {
  return dates.map((date) => {
    const key = `${userId}:${date}`;
    const report = reportsByUserDate.get(key);

    if (report) {
      return {
        date,
        source: "REPORT" as const,
        workLocation: report.workLocation,
        reportId: report.id,
      };
    }

    const plan = plansByUserDate.get(key);

    return {
      date,
      source: plan ? ("PLAN" as const) : ("NONE" as const),
      workLocation: plan?.workLocation ?? null,
      reportId: null,
    };
  });
}

function serializedPlanLocation(value: string | null) {
  return normalizePlannedWorkLocationValue(value);
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

export async function listPlannedWorkLocations(
  userId: string,
  startDateString: string,
  endDateString: string,
) {
  const startDate = parseReportDate(startDateString);
  const endDate = parseReportDate(endDateString);
  const plans = await prisma.plannedWorkLocation.findMany({
    where: {
      userId,
      workDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { workDate: "asc" },
  });

  return plans.flatMap((plan) => {
    const workLocation = serializedPlanLocation(plan.workLocation);

    return workLocation
      ? [
          {
            id: plan.id,
            userId: plan.userId,
            date: dateToString(plan.workDate),
            workLocation,
          },
        ]
      : [];
  });
}

export async function getPlannedWorkLocation(
  userId: string,
  dateString: string,
) {
  const plan = await prisma.plannedWorkLocation.findUnique({
    where: {
      userId_workDate: {
        userId,
        workDate: parseReportDate(dateString),
      },
    },
  });

  if (!plan) {
    return null;
  }

  const workLocation = serializedPlanLocation(plan.workLocation);

  return workLocation
    ? {
        id: plan.id,
        userId: plan.userId,
        date: dateToString(plan.workDate),
        workLocation,
      }
    : null;
}

export async function setPlannedWorkLocation({
  userId,
  dateString,
  workLocation,
}: {
  userId: string;
  dateString: string;
  workLocation?: PlannedWorkLocationValue | null;
}) {
  const workDate = parseReportDate(dateString);

  if (!workLocation) {
    await prisma.plannedWorkLocation.deleteMany({
      where: {
        userId,
        workDate,
      },
    });

    return null;
  }

  const normalizedWorkLocation = normalizePlannedWorkLocationValue(workLocation);

  if (!normalizedWorkLocation || !isPlannedWorkLocation(normalizedWorkLocation)) {
    throw new HttpError(422, "Choose a valid planned work location.");
  }

  const plan = await prisma.plannedWorkLocation.upsert({
    where: {
      userId_workDate: {
        userId,
        workDate,
      },
    },
    update: {
      workLocation: normalizedWorkLocation,
    },
    create: {
      userId,
      workDate,
      workLocation: normalizedWorkLocation,
    },
  });

  return {
    id: plan.id,
    userId: plan.userId,
    date: dateToString(plan.workDate),
    workLocation: normalizePlannedWorkLocationValue(plan.workLocation)!,
  };
}

async function departmentIdsForScope(scope: ReviewScope, role: UserRole) {
  const user = await prisma.user.findUnique({
    where: { id: scope.userId },
    select: {
      reviewerAllDepartments: true,
      departments: {
        where: { role },
        select: { departmentId: true },
      },
    },
  });

  if (role === "REVIEWER" && user?.reviewerAllDepartments) {
    return null;
  }

  return uniqueIds(user?.departments.map((item) => item.departmentId) ?? []);
}

async function calendarEmployeeWhere({
  scope,
  departmentId,
}: {
  scope: ReviewScope;
  departmentId?: string | null;
}): Promise<Prisma.UserWhereInput> {
  const base: Prisma.UserWhereInput = {
    roles: { has: "EMPLOYEE" },
    status: { not: "DISABLED" },
  };

  if (hasUserRole(scope, "ADMIN")) {
    return departmentId
      ? {
          ...base,
          departments: {
            some: {
              role: "EMPLOYEE",
              departmentId,
            },
          },
        }
      : base;
  }

  const role = hasUserRole(scope, "REVIEWER") ? "REVIEWER" : "EMPLOYEE";
  const scopedDepartmentIds = await departmentIdsForScope(scope, role);

  if (scopedDepartmentIds === null) {
    return departmentId
      ? {
          ...base,
          departments: {
            some: {
              role: "EMPLOYEE",
              departmentId,
            },
          },
        }
      : base;
  }

  const allowedDepartmentIds = departmentId
    ? scopedDepartmentIds.filter((id) => id === departmentId)
    : scopedDepartmentIds;

  if (allowedDepartmentIds.length === 0) {
    return {
      ...base,
      id: { in: [] },
    };
  }

  return {
    ...base,
    departments: {
      some: {
        role: "EMPLOYEE",
        departmentId: { in: allowedDepartmentIds },
      },
    },
  };
}

export async function getWorkLocationCalendarData({
  dateString,
  scope,
  departmentId,
}: {
  dateString: string;
  scope: ReviewScope;
  departmentId?: string | null;
}) {
  const { start, end } = reportWorkWeekRange(dateString);
  const monthRange = monthDateRange(dateString);
  const dates = weekDates(start, end);
  const monthDates = calendarMonthDates(monthRange.start);
  const monthDateValues = monthDates.map((day) => day.date);
  const queryStart = [start, monthDateValues[0]].sort()[0];
  const queryEnd = [end, monthDateValues[monthDateValues.length - 1]].sort()[1];
  const queryStartDate = parseReportDate(queryStart);
  const queryEndDate = parseReportDate(queryEnd);
  const weekStartDate = parseReportDate(start);
  const weekEndDate = parseReportDate(end);
  const viewerReviewerDepartmentIds = hasUserRole(scope, "REVIEWER")
    ? await departmentIdsForScope(scope, "REVIEWER")
    : undefined;
  const employeeWhere = await calendarEmployeeWhere({ scope, departmentId });
  const canPlanOwnWeek = hasUserRole(scope, "EMPLOYEE");
  const users = await prisma.user.findMany({
    where: employeeWhere,
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: calendarUserSelect,
  });
  const userIds = users.map((user) => user.id);
  const [reports, plans, ownPlans, departments] = await Promise.all([
    userIds.length
      ? prisma.dailyReport.findMany({
          where: {
            userId: { in: userIds },
            status: "SUBMITTED",
            reportDate: {
              gte: queryStartDate,
              lte: queryEndDate,
            },
          },
          select: {
            id: true,
            userId: true,
            reportDate: true,
            workLocation: true,
            status: true,
          },
        })
      : [],
    userIds.length
      ? prisma.plannedWorkLocation.findMany({
          where: {
            userId: { in: userIds },
            workDate: {
              gte: queryStartDate,
              lte: queryEndDate,
            },
          },
        })
      : [],
    canPlanOwnWeek
      ? prisma.plannedWorkLocation.findMany({
          where: {
            userId: scope.userId,
            workDate: {
              gte: weekStartDate,
              lte: weekEndDate,
            },
          },
          orderBy: { workDate: "asc" },
        })
      : [],
    prisma.department.findMany({
      where:
        hasUserRole(scope, "ADMIN") || viewerReviewerDepartmentIds === null
          ? {}
          : {
              users: {
                some: {
                  userId: scope.userId,
                  role: hasUserRole(scope, "REVIEWER")
                    ? "REVIEWER"
                    : "EMPLOYEE",
                },
              },
            },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    }),
  ]);
  const reportsByUserDate = new Map(
    reports.map((report) => [
      `${report.userId}:${dateToString(report.reportDate)}`,
      {
        id: report.id,
        workLocation: normalizeWorkLocationValue(report.workLocation),
      },
    ]),
  );
  const plansByUserDate = new Map(
    plans.map((plan) => [
      `${plan.userId}:${dateToString(plan.workDate)}`,
      {
        workLocation: normalizeWorkLocationValue(plan.workLocation),
      },
    ]),
  );

  return {
    viewerUserId: scope.userId,
    canPlanOwnWeek,
    weekStart: start,
    weekEnd: end,
    dates,
    departments,
    selectedDepartmentId: departmentId ?? null,
    myPlans: ownPlans.flatMap((plan) => {
      const workLocation = serializedPlanLocation(plan.workLocation);

      return workLocation
        ? [
            {
              id: plan.id,
              userId: plan.userId,
              date: dateToString(plan.workDate),
              workLocation,
            },
          ]
        : [];
    }),
    rows: users.map((user) => ({
      user,
      days: calendarDaysForUser({
        userId: user.id,
        dates,
        reportsByUserDate,
        plansByUserDate,
      }),
    })),
    month: {
      monthStart: monthRange.start,
      monthEnd: monthRange.end,
      dates: monthDates,
      rows: users.map((user) => ({
        user,
        days: calendarDaysForUser({
          userId: user.id,
          dates: monthDateValues,
          reportsByUserDate,
          plansByUserDate,
        }),
      })),
    },
  };
}
