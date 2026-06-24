// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRouterPush } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

vi.mock("next/link", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");

  return {
    default: ({
      href,
      children,
      ...props
    }: {
      href: string;
      children: React.ReactNode;
    }) =>
      ReactModule.createElement(
        "a",
        {
          ...props,
          href,
        },
        children,
      ),
  };
});

import { WorkLocationCalendar } from "@/components/reports/work-location-calendar";

type CalendarData = React.ComponentProps<typeof WorkLocationCalendar>["data"];

const baseData: CalendarData = {
  viewerUserId: "user-1",
  canPlanOwnWeek: true,
  weekStart: "2026-05-18",
  weekEnd: "2026-05-24",
  dates: [
    "2026-05-18",
    "2026-05-19",
    "2026-05-20",
    "2026-05-21",
    "2026-05-22",
    "2026-05-23",
    "2026-05-24",
  ],
  departments: [
    { id: "dept-it", name: "IT", slug: "it" },
    { id: "dept-prod", name: "Production", slug: "production" },
  ],
  selectedDepartmentId: null,
  myPlans: [],
  rows: [
    {
      user: {
        id: "user-1",
        name: "Alice Example",
        email: "alice@generisgp.com",
        departments: [
          {
            role: "EMPLOYEE",
            department: { name: "IT" },
          },
        ],
      },
      days: [
        {
          date: "2026-05-18",
          source: "NONE",
          workLocation: null,
          reportId: null,
        },
        {
          date: "2026-05-19",
          source: "NONE",
          workLocation: null,
          reportId: null,
        },
        {
          date: "2026-05-20",
          source: "NONE",
          workLocation: null,
          reportId: null,
        },
        {
          date: "2026-05-21",
          source: "NONE",
          workLocation: null,
          reportId: null,
        },
        {
          date: "2026-05-22",
          source: "NONE",
          workLocation: null,
          reportId: null,
        },
        {
          date: "2026-05-23",
          source: "NONE",
          workLocation: null,
          reportId: null,
        },
        {
          date: "2026-05-24",
          source: "NONE",
          workLocation: null,
          reportId: null,
        },
      ],
    },
    {
      user: {
        id: "user-2",
        name: "Bob Builder",
        email: "bob@generisgp.com",
        departments: [
          {
            role: "EMPLOYEE",
            department: { name: "Production" },
          },
        ],
      },
      days: [
        {
          date: "2026-05-18",
          source: "NONE",
          workLocation: null,
          reportId: null,
        },
        {
          date: "2026-05-19",
          source: "NONE",
          workLocation: null,
          reportId: null,
        },
        {
          date: "2026-05-20",
          source: "NONE",
          workLocation: null,
          reportId: null,
        },
        {
          date: "2026-05-21",
          source: "NONE",
          workLocation: null,
          reportId: null,
        },
        {
          date: "2026-05-22",
          source: "NONE",
          workLocation: null,
          reportId: null,
        },
        {
          date: "2026-05-23",
          source: "NONE",
          workLocation: null,
          reportId: null,
        },
        {
          date: "2026-05-24",
          source: "NONE",
          workLocation: null,
          reportId: null,
        },
      ],
    },
  ],
  month: {
    monthStart: "2026-05-01",
    monthEnd: "2026-05-31",
    dates: [
      { date: "2026-05-18", inCurrentMonth: true },
      { date: "2026-05-19", inCurrentMonth: true },
      { date: "2026-05-20", inCurrentMonth: true },
      { date: "2026-05-21", inCurrentMonth: true },
      { date: "2026-05-22", inCurrentMonth: true },
      { date: "2026-05-23", inCurrentMonth: true },
      { date: "2026-05-24", inCurrentMonth: true },
    ],
    rows: [
      {
        user: {
          id: "user-1",
          name: "Alice Example",
          email: "alice@generisgp.com",
          departments: [
            {
              role: "EMPLOYEE",
              department: { name: "IT" },
            },
          ],
        },
        days: [
          {
            date: "2026-05-18",
            source: "PLAN",
            workLocation: "WFH",
            reportId: null,
          },
          {
            date: "2026-05-19",
            source: "PLAN",
            workLocation: "WFH_AM_OFFICE_PM",
            reportId: null,
          },
          {
            date: "2026-05-20",
            source: "PLAN",
            workLocation: "OFFICE_AM_WFH_PM",
            reportId: null,
          },
          {
            date: "2026-05-21",
            source: "NONE",
            workLocation: null,
            reportId: null,
          },
          {
            date: "2026-05-22",
            source: "NONE",
            workLocation: null,
            reportId: null,
          },
          {
            date: "2026-05-23",
            source: "NONE",
            workLocation: null,
            reportId: null,
          },
          {
            date: "2026-05-24",
            source: "NONE",
            workLocation: null,
            reportId: null,
          },
        ],
      },
      {
        user: {
          id: "user-2",
          name: "Bob Builder",
          email: "bob@generisgp.com",
          departments: [
            {
              role: "EMPLOYEE",
              department: { name: "Production" },
            },
          ],
        },
        days: [
          {
            date: "2026-05-18",
            source: "NONE",
            workLocation: null,
            reportId: null,
          },
          {
            date: "2026-05-19",
            source: "NONE",
            workLocation: null,
            reportId: null,
          },
          {
            date: "2026-05-20",
            source: "NONE",
            workLocation: null,
            reportId: null,
          },
          {
            date: "2026-05-21",
            source: "REPORT",
            workLocation: "WFH",
            reportId: "report-1",
          },
          {
            date: "2026-05-22",
            source: "NONE",
            workLocation: null,
            reportId: null,
          },
          {
            date: "2026-05-23",
            source: "NONE",
            workLocation: null,
            reportId: null,
          },
          {
            date: "2026-05-24",
            source: "NONE",
            workLocation: null,
            reportId: null,
          },
        ],
      },
    ],
  },
};

function renderCalendar(
  data: CalendarData = baseData,
  initialView?: React.ComponentProps<typeof WorkLocationCalendar>["initialView"],
) {
  return render(<WorkLocationCalendar data={data} initialView={initialView} />);
}

function overflowMonthRow(id: string, name: string): CalendarData["month"]["rows"][number] {
  return {
    user: {
      id,
      name,
      email: `${id}@generisgp.com`,
      departments: [
        {
          role: "EMPLOYEE",
          department: { name: "IT" },
        },
      ],
    },
    days: baseData.month.dates.map((day, index) => ({
      date: day.date,
      source: index === 0 ? ("PLAN" as const) : ("NONE" as const),
      workLocation: index === 0 ? ("WFH" as const) : null,
      reportId: null,
    })),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("WorkLocationCalendar", () => {
  it("saves my weekly plan and updates my visible calendar row", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        plan: {
          id: "plan-1",
          userId: "user-1",
          date: "2026-05-20",
          workLocation: "OFFICE",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: "Plan for Wed, May 20" }));
    fireEvent.click(
      within(screen.getByRole("listbox")).getByRole("option", {
        name: "Office",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/work-location-plans",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining('"workLocation":"OFFICE"'),
        }),
      );
    });
    expect(await screen.findByText("Weekly plan saved.")).toBeTruthy();
    expect(screen.getAllByText("Planned")).toHaveLength(1);
  });

  it("searches people rows without leaving the locations page", () => {
    renderCalendar();

    fireEvent.change(screen.getByLabelText("Search people"), {
      target: { value: "bob" },
    });

    expect(screen.queryByText("Alice Example")).toBeNull();
    expect(screen.getByText("Bob Builder")).toBeTruthy();
  });

  it("navigates when the department filter changes", () => {
    renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: "Department" }));
    fireEvent.click(
      within(screen.getByRole("listbox")).getByRole("option", {
        name: "Production",
      }),
    );

    expect(mockRouterPush).toHaveBeenCalledWith(
      "/calendar?date=2026-05-18&departmentId=dept-prod",
    );
  });

  it("opens the week picker outside the clipped locations layout", () => {
    renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: "Jump to week" }));

    const weekPicker = document.getElementById("work-location-week-picker");

    expect(weekPicker).toBeTruthy();
    expect(weekPicker?.parentElement).toBe(document.body);
  });

  it("renders the WFH calendar with full-day and half-day bars", () => {
    renderCalendar(baseData, "wfh-calendar");

    expect(
      screen.getByRole("heading", { name: "WFH calendar" }),
    ).toBeTruthy();
    expect(screen.getByTitle("Alice Example - WFH")).toBeTruthy();
    expect(screen.getByTitle("Alice Example - AM WFH")).toBeTruthy();
    expect(screen.getByTitle("Alice Example - PM WFH")).toBeTruthy();
    expect(screen.getByTitle("Bob Builder - WFH")).toBeTruthy();
  });

  it("keeps the WFH calendar view in month navigation links", () => {
    renderCalendar(baseData, "wfh-calendar");

    expect(
      screen.getByRole("link", { name: "Next month" }).getAttribute("href"),
    ).toBe("/calendar?date=2026-06-01&view=wfh-calendar");
  });

  it("uses a month-only selector for the WFH calendar jump control", () => {
    renderCalendar(baseData, "wfh-calendar");

    fireEvent.click(screen.getByRole("button", { name: "Jump to month" }));
    fireEvent.click(
      within(screen.getByRole("listbox")).getByRole("option", {
        name: "June 2026",
      }),
    );

    expect(mockRouterPush).toHaveBeenCalledWith(
      "/calendar?date=2026-06-01&view=wfh-calendar",
    );
  });

  it("opens WFH day overflow outside the clipped calendar scroller", () => {
    renderCalendar(
      {
        ...baseData,
        month: {
          ...baseData.month,
          rows: [
            ...baseData.month.rows,
            overflowMonthRow("charlie", "Charlie Overflow"),
            overflowMonthRow("dana", "Dana Overflow"),
            overflowMonthRow("erin", "Erin Overflow"),
            overflowMonthRow("frank", "Frank Overflow"),
            overflowMonthRow("grace", "Grace Overflow"),
          ],
        },
      },
      "wfh-calendar",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Show all WFH people for May 18, 2026",
      }),
    );

    const overflowDialog = screen.getByRole("dialog", {
      name: "WFH people for May 18, 2026",
    });

    expect(overflowDialog.parentElement).toBe(document.body);
    expect(within(overflowDialog).getByText("Charlie Overflow")).toBeTruthy();
    expect(within(overflowDialog).getByText("Grace Overflow")).toBeTruthy();
  });
});
