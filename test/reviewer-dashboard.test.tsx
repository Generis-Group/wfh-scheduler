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
  it("does not show a redundant submitted status pill inside opened daily reports", async () => {
    const fetchMock = vi.fn(async () =>
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
    expect(document.querySelector(".report-pdf-header")?.textContent).not.toContain(
      "Submitted",
    );
  });

  it("opens a generated weekly report for an employee", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          weeklyReport: {
            employee,
            weekStart: "2026-05-11",
            weekEnd: "2026-05-15",
            reports: [],
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

    fireEvent.click(screen.getByRole("button", { name: "Week" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/review/weekly-report?userId=employee-1&date=2026-05-13",
      );
    });

    expect(
      await screen.findByRole("heading", { name: "Weekly Report" }),
    ).toBeTruthy();
    expect(screen.getByText("Alex Employee")).toBeTruthy();
    expect(
      screen.getAllByText("May 11, 2026 - May 15, 2026").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("No submitted report.")).toHaveLength(5);
  });

  it("sends a reminder for a missing employee report", async () => {
    const fetchMock = vi.fn(async () =>
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
    expect(await screen.findByText("Reminder emailed to Alex Employee.")).toBeTruthy();
  });
});
