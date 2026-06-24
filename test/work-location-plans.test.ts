import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDailyReportFindMany,
  mockDepartmentFindMany,
  mockPlannedWorkLocationDeleteMany,
  mockPlannedWorkLocationFindMany,
  mockPlannedWorkLocationFindUnique,
  mockPlannedWorkLocationUpsert,
  mockUserFindMany,
  mockUserFindUnique,
} = vi.hoisted(() => ({
  mockDailyReportFindMany: vi.fn(),
  mockDepartmentFindMany: vi.fn(),
  mockPlannedWorkLocationDeleteMany: vi.fn(),
  mockPlannedWorkLocationFindMany: vi.fn(),
  mockPlannedWorkLocationFindUnique: vi.fn(),
  mockPlannedWorkLocationUpsert: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dailyReport: {
      findMany: mockDailyReportFindMany,
    },
    department: {
      findMany: mockDepartmentFindMany,
    },
    plannedWorkLocation: {
      deleteMany: mockPlannedWorkLocationDeleteMany,
      findMany: mockPlannedWorkLocationFindMany,
      findUnique: mockPlannedWorkLocationFindUnique,
      upsert: mockPlannedWorkLocationUpsert,
    },
    user: {
      findMany: mockUserFindMany,
      findUnique: mockUserFindUnique,
    },
  },
}));

vi.mock("@/lib/services/departments", () => ({
  departmentMembershipSelect: {
    departments: {
      select: {
        departmentId: true,
        role: true,
        department: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    },
  },
}));

vi.mock("@/lib/services/reports", () => ({
  reportWorkWeekRange: vi.fn(() => ({
    start: "2026-05-11",
    end: "2026-05-17",
  })),
}));

describe("work location plans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({
      reviewerAllDepartments: false,
      departments: [{ departmentId: "dept-it" }],
    });
    mockUserFindMany.mockResolvedValue([
      {
        id: "employee-1",
        name: "Employee",
        email: "employee@generisgp.com",
        role: "EMPLOYEE",
        roles: ["EMPLOYEE"],
        status: "ACTIVE",
        departments: [
          {
            departmentId: "dept-it",
            role: "EMPLOYEE",
            department: { id: "dept-it", name: "IT", slug: "it" },
          },
        ],
      },
    ]);
    mockDepartmentFindMany.mockResolvedValue([
      { id: "dept-it", name: "IT", slug: "it" },
    ]);
    mockDailyReportFindMany.mockResolvedValue([]);
    mockPlannedWorkLocationFindMany.mockResolvedValue([]);
    mockPlannedWorkLocationFindUnique.mockResolvedValue(null);
    mockPlannedWorkLocationDeleteMany.mockResolvedValue({ count: 0 });
  });

  it("rejects retired Hybrid as a planned location", async () => {
    const { setPlannedWorkLocation } =
      await import("@/lib/services/work-location-plans");

    await expect(
      setPlannedWorkLocation({
        userId: "employee-1",
        dateString: "2026-05-13",
        workLocation: "HYBRID" as never,
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: "Choose a valid planned work location.",
    });
    expect(mockPlannedWorkLocationUpsert).not.toHaveBeenCalled();
  });

  it("normalizes legacy PTO plan writes to out of office", async () => {
    mockPlannedWorkLocationUpsert.mockResolvedValue({
      id: "plan-pto",
      userId: "employee-1",
      workDate: new Date("2026-05-13T00:00:00.000Z"),
      workLocation: "OUT_OF_OFFICE",
    });
    const { setPlannedWorkLocation } =
      await import("@/lib/services/work-location-plans");

    await expect(
      setPlannedWorkLocation({
        userId: "employee-1",
        dateString: "2026-05-13",
        workLocation: "PTO" as never,
      }),
    ).resolves.toMatchObject({
      workLocation: "OUT_OF_OFFICE",
    });
    expect(mockPlannedWorkLocationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { workLocation: "OUT_OF_OFFICE" },
        create: expect.objectContaining({ workLocation: "OUT_OF_OFFICE" }),
      }),
    );
  });

  it("normalizes legacy PTO plan reads to out of office", async () => {
    mockPlannedWorkLocationFindMany.mockResolvedValue([
      {
        id: "plan-pto",
        userId: "employee-1",
        workDate: new Date("2026-05-13T00:00:00.000Z"),
        workLocation: "PTO",
      },
    ]);
    const { listPlannedWorkLocations } =
      await import("@/lib/services/work-location-plans");

    await expect(
      listPlannedWorkLocations("employee-1", "2026-05-11", "2026-05-17"),
    ).resolves.toEqual([
      {
        id: "plan-pto",
        userId: "employee-1",
        date: "2026-05-13",
        workLocation: "OUT_OF_OFFICE",
      },
    ]);
  });

  it("deletes a plan when the location is cleared", async () => {
    const { setPlannedWorkLocation } =
      await import("@/lib/services/work-location-plans");

    await expect(
      setPlannedWorkLocation({
        userId: "employee-1",
        dateString: "2026-05-13",
        workLocation: null,
      }),
    ).resolves.toBeNull();
    expect(mockPlannedWorkLocationDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: "employee-1",
        workDate: new Date("2026-05-13T00:00:00.000Z"),
      },
    });
  });

  it("uses submitted reports before weekly plans in calendar data", async () => {
    mockDailyReportFindMany.mockResolvedValue([
      {
        id: "report-1",
        userId: "employee-1",
        reportDate: new Date("2026-05-13T00:00:00.000Z"),
        workLocation: "WFH",
        status: "SUBMITTED",
      },
    ]);
    mockPlannedWorkLocationFindMany.mockResolvedValue([
      {
        id: "plan-1",
        userId: "employee-1",
        workDate: new Date("2026-05-13T00:00:00.000Z"),
        workLocation: "OFFICE",
      },
      {
        id: "plan-2",
        userId: "employee-1",
        workDate: new Date("2026-05-14T00:00:00.000Z"),
        workLocation: "OFFICE_AM_WFH_PM",
      },
    ]);
    const { getWorkLocationCalendarData } =
      await import("@/lib/services/work-location-plans");

    const data = await getWorkLocationCalendarData({
      dateString: "2026-05-13",
      scope: { userId: "viewer-1", roles: ["EMPLOYEE"] },
    });

    expect(data.rows[0]?.days).toEqual(
      expect.arrayContaining([
        {
          date: "2026-05-13",
          source: "REPORT",
          workLocation: "WFH",
          reportId: "report-1",
        },
        {
          date: "2026-05-14",
          source: "PLAN",
          workLocation: "OFFICE_AM_WFH_PM",
          reportId: null,
        },
      ]),
    );
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          departments: {
            some: {
              role: "EMPLOYEE",
              departmentId: { in: ["dept-it"] },
            },
          },
        }),
      }),
    );
  });

  it("scopes reviewer calendar data to reviewer departments", async () => {
    const { getWorkLocationCalendarData } =
      await import("@/lib/services/work-location-plans");

    await getWorkLocationCalendarData({
      dateString: "2026-05-13",
      scope: { userId: "reviewer-1", roles: ["REVIEWER"] },
    });

    expect(mockUserFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reviewer-1" },
        select: expect.objectContaining({
          departments: expect.objectContaining({
            where: { role: "REVIEWER" },
          }),
        }),
      }),
    );
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          departments: {
            some: {
              role: "EMPLOYEE",
              departmentId: { in: ["dept-it"] },
            },
          },
        }),
      }),
    );
    expect(mockDepartmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          users: {
            some: {
              userId: "reviewer-1",
              role: "REVIEWER",
            },
          },
        },
      }),
    );
  });

  it("lets admins view all departments and filter employees by department", async () => {
    const { getWorkLocationCalendarData } =
      await import("@/lib/services/work-location-plans");

    await getWorkLocationCalendarData({
      dateString: "2026-05-13",
      scope: { userId: "admin-1", roles: ["ADMIN"] },
      departmentId: "dept-finance",
    });

    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          departments: {
            some: {
              role: "EMPLOYEE",
              departmentId: "dept-finance",
            },
          },
        }),
      }),
    );
    expect(mockDepartmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
  });
});
