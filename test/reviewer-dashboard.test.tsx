// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReviewerDashboard } from "@/components/reports/reviewer-dashboard";

const { mockRouterPush } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    prefetch: vi.fn(),
  }),
}));

const employee = {
  id: "employee-1",
  name: "Alex Employee",
  email: "alex@generisgp.com",
  role: "EMPLOYEE",
  status: "ACTIVE",
  departments: [{ department: { name: "Operations" } }],
};

const metrics = {
  users: 1,
  submitted: 0,
  sourceMix: [],
};

const submittedReport = {
  id: "report-1",
  reportDate: "2026-05-13",
  status: "SUBMITTED" as const,
  workLocation: "WFH",
  summary: "Finished the weekly planning notes.",
  submittedAt: "2026-05-13T20:30:00.000Z",
  updatedAt: "2026-05-13T20:30:00.000Z",
  activities: [],
  comments: [],
  readReceipts: [],
  revisions: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("ReviewerDashboard weekly reports", () => {
  it("uses one consistent action button layout for submitted and missing rows", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    render(
      <ReviewerDashboard
        rows={[
          { user: employee, report: null },
          {
            user: { ...employee, id: "employee-2", name: "Jad Chahin" },
            report: submittedReport,
          },
        ]}
        metrics={{ ...metrics, users: 2, submitted: 1 }}
        date="2026-05-13"
        reviewerId="reviewer-1"
      />,
    );

    const actionGroups = screen.getAllByTestId("employee-report-row-actions");
    expect(actionGroups).toHaveLength(2);
    expect(new Set(actionGroups.map((group) => group.className)).size).toBe(1);

    actionGroups.forEach((group) => {
      const actions = group.querySelectorAll(
        '[data-testid="employee-report-row-action"]',
      );
      expect(actions).toHaveLength(1);
      actions.forEach((action) => {
        expect(action.querySelector("svg")).toBeTruthy();
      });
      expect(
        group.querySelector('button[aria-haspopup="menu"] svg'),
      ).toBeTruthy();
    });

    expect(screen.getByRole("button", { name: "Review" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Week" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "More actions for Alex Employee" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Send reminder to Alex Employee" }),
    ).toBeTruthy();
  });

  it("chooses the selected read action from the selected reports", async () => {
    const readReport = {
      ...submittedReport,
      id: "report-read",
      readReceipts: [
        {
          reviewerId: "reviewer-1",
          readAt: "2026-05-13T21:00:00.000Z",
        },
      ],
    };
    const fetchMock = vi.fn(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const read = JSON.parse(String(init?.body ?? "{}")).read;
      const report = url.includes("report-read") ? readReport : submittedReport;

      return new Response(
        JSON.stringify({
          report: {
            ...report,
            readReceipts: read
              ? [
                  {
                    reviewerId: "reviewer-1",
                    readAt: "2026-05-13T21:05:00.000Z",
                  },
                ]
              : [],
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ReviewerDashboard
        rows={[
          { user: employee, report: submittedReport },
          {
            user: { ...employee, id: "employee-2", name: "Riley Read" },
            report: readReport,
          },
        ]}
        metrics={{ ...metrics, users: 2, submitted: 2 }}
        date="2026-05-13"
        reviewerId="reviewer-1"
      />,
    );

    fireEvent.click(screen.getByLabelText("Select Riley Read"));
    expect(screen.getByRole("button", { name: "Mark as unread" })).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Select Alex Employee"));
    const bulkButton = screen.getByRole("button", { name: "Mark as read" });
    expect(bulkButton).toBeTruthy();
    fireEvent.click(bulkButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(
      fetchMock.mock.calls.map((call) =>
        JSON.parse(String(call[1]?.body ?? "{}")),
      ),
    ).toEqual([{ read: true }, { read: true }]);
  });

  it("does not show a redundant submitted status pill inside opened daily reports", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ report: submittedReport }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ReviewerDashboard
        rows={[{ user: employee, report: submittedReport }]}
        metrics={metrics}
        date="2026-05-13"
        reviewerId="reviewer-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review" }));

    expect(
      await screen.findByRole("heading", { name: "Daily Report" }),
    ).toBeTruthy();
    expect(
      document.querySelector(".report-pdf-header")?.textContent,
    ).not.toContain("Submitted");
    expect(screen.getByLabelText("Add review note")).toBeTruthy();

    const reviewNotesPanel = screen.getByRole("complementary", {
      name: "Review notes",
    });
    const reportDocument = document.querySelector(".report-pdf-document");
    expect(reviewNotesPanel).toBeTruthy();
    expect(reportDocument).toBeTruthy();
    expect(reportDocument!.textContent).not.toContain("Review Notes");
    expect(reportDocument!.textContent).not.toContain("Add review note");
    expect(reviewNotesPanel.compareDocumentPosition(reportDocument!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(reviewNotesPanel.className).toContain("report-pdf-screen-only");
  });

  it("opens a generated weekly report for an employee", async () => {
    const weeklySubmittedReport = {
      ...submittedReport,
      id: "weekly-report-1",
      reportDate: "2026-05-11",
      activities: [
        {
          id: "activity-jira",
          title: "Review Jira issues",
          source: "JIRA",
          selected: true,
          status: "Done",
          durationMinutes: 45,
          employeeNote: "Closed the highest priority follow-up.",
        },
        {
          id: "activity-calendar",
          title: "Client sync",
          source: "GOOGLE_CALENDAR",
          selected: true,
          status: "Complete",
          durationMinutes: 30,
          employeeNote: null,
        },
      ],
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            weeklyReport: {
              employee,
              weekStart: "2026-05-11",
              weekEnd: "2026-05-17",
              reports: [weeklySubmittedReport],
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ReviewerDashboard
        rows={[{ user: employee, report: null }]}
        metrics={metrics}
        date="2026-05-13"
        reviewerId="reviewer-1"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "More actions for Alex Employee" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Weekly report" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/review/weekly-report",
        {
          body: JSON.stringify({
            userId: "employee-1",
            date: "2026-05-13",
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
    });

    expect(
      await screen.findByRole("heading", { name: "Weekly Report" }),
    ).toBeTruthy();
    expect(screen.getByText("Alex Employee")).toBeTruthy();
    expect(
      screen.getAllByText("May 11, 2026 - May 17, 2026").length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelectorAll(".report-pdf-screen-only .weekly-report-day")
        .length,
    ).toBe(1);
    expect(
      document.querySelectorAll(".report-pdf-print-only .weekly-report-day")
        .length,
    ).toBe(7);
    expect(screen.getByText("1 of 7 submitted")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Tue, May 12 Missing" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Monday, May 11").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Review Jira issues").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Client sync").length).toBeGreaterThan(0);
    expect(
      document.querySelectorAll(".weekly-report-source-icon svg").length,
    ).toBeGreaterThanOrEqual(2);
    expect(document.querySelector(".report-pdf-activity-table")).toBeNull();
    expect(screen.queryByText("No activities included.")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Back to review dashboard" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "More actions for Alex Employee" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Weekly report" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("opens a saved weekly report from employee actions", async () => {
    const weeklySubmittedReport = {
      ...submittedReport,
      id: "weekly-report-1",
      reportDate: "2026-05-04",
      activities: [
        {
          id: "activity-drive",
          title: "Implementation notes",
          source: "GOOGLE_TASKS",
          selected: true,
          status: "Done",
          durationMinutes: 35,
          employeeNote: null,
        },
      ],
    };
    const fetchMock = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.url;

      if (url.includes("/api/review/weekly-reports/weekly-report-1")) {
        return new Response(
          JSON.stringify({
            weeklyReport: {
              id: "weekly-report-1",
              employee,
              weekStart: "2026-05-04",
              weekEnd: "2026-05-10",
              generatedAt: "2026-05-10T20:00:00.000Z",
              submittedCount: 1,
              expectedDays: 7,
              activityCount: 1,
              reports: [weeklySubmittedReport],
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          weeklyReports: {
            employee,
            reports: [
              {
                id: "weekly-report-1",
                weekStart: "2026-05-04",
                weekEnd: "2026-05-10",
                generatedAt: "2026-05-10T20:00:00.000Z",
                submittedCount: 1,
                expectedDays: 7,
                activityCount: 1,
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ReviewerDashboard
        rows={[{ user: employee, report: null }]}
        metrics={metrics}
        date="2026-05-13"
        reviewerId="reviewer-1"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "More actions for Alex Employee" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "View saved reports" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Saved Weekly Reports" }),
    ).toBeTruthy();
    expect(screen.getByText("May 4, 2026 - May 10, 2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View report" }));

    expect(
      await screen.findByRole("heading", { name: "Weekly Report" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Implementation notes").length).toBeGreaterThan(
      0,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/review/weekly-reports?userId=employee-1",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/review/weekly-reports/weekly-report-1",
    );
  });

  it("sends a reminder for a missing employee report", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            employee,
            emailDelivery: {
              status: "SENT",
              providerMessageId: "reminder-1",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ReviewerDashboard
        rows={[{ user: employee, report: null }]}
        metrics={metrics}
        date="2026-05-13"
        reviewerId="reviewer-1"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Send reminder to Alex Employee" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/review/report-reminder",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            userId: "employee-1",
            date: "2026-05-13",
          }),
        }),
      );
    });
    expect(
      await screen.findByText("Reminder emailed to Alex Employee."),
    ).toBeTruthy();
  });
});
