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

import { BugReportPage } from "@/components/bugs/bug-report-page";

const openReport = {
  id: "bug-open",
  body: "Blank page after save.",
  pagePath: "/reports",
  userAgent: "Vitest",
  status: "OPEN" as const,
  solvedAt: null,
  solvedBy: null,
  createdAt: "2026-05-29T15:00:00.000Z",
  reporter: {
    id: "employee-1",
    name: "Alex Employee",
    email: "alex@generisgp.com",
    image: null,
  },
  attachments: [],
};

const solvedReport = {
  id: "bug-solved",
  body: "Screenshot upload was failing.",
  pagePath: "/bugs",
  userAgent: "Vitest",
  status: "SOLVED" as const,
  solvedAt: "2026-05-29T16:00:00.000Z",
  solvedBy: {
    id: "admin-1",
    name: "Admin",
    email: "admin@generisgp.com",
    image: null,
  },
  createdAt: "2026-05-29T14:00:00.000Z",
  reporter: {
    id: "employee-2",
    name: "Riley Reporter",
    email: "riley@generisgp.com",
    image: null,
  },
  attachments: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BugReportPage", () => {
  it("moves solved reports into the separate archive", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        bugReport: {
          ...openReport,
          status: "SOLVED",
          solvedAt: "2026-05-29T17:00:00.000Z",
          solvedBy: {
            id: "admin-1",
            name: "Admin",
            email: "admin@generisgp.com",
            image: null,
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BugReportPage
        initialReports={[openReport, solvedReport]}
        canReviewAll
        currentUserName="Admin"
        initialSelectedReportId={openReport.id}
      />,
    );

    const openList = screen.getByText("Open bug reports").parentElement!;

    expect(within(openList).getByText("Blank page after save.")).toBeTruthy();
    expect(
      screen.queryByText("Screenshot upload was failing."),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mark solved" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(within(openList).getByText("No open bug reports.")).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Solved archive/ }));

    const archive = screen.getByRole("dialog", { name: "Solved bug reports" });

    expect(
      within(archive).getAllByText("Blank page after save.").length,
    ).toBeGreaterThan(0);
    expect(
      within(archive).getByText("Screenshot upload was failing."),
    ).toBeTruthy();
    expect(within(archive).getByRole("button", { name: "Reopen" })).toBeTruthy();
  });
});
