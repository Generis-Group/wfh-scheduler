// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReportHistory } from "@/components/reports/report-history";

const reportWithComment = {
  id: "report-1",
  reportDate: "2026-05-13",
  status: "SUBMITTED" as const,
  workLocation: "WFH",
  summary: "Wrapped the release notes.",
  submittedAt: "2026-05-13T20:00:00.000Z",
  updatedAt: "2026-05-13T20:00:00.000Z",
  user: null,
  activities: [],
  comments: [
    {
      id: "comment-1",
      body: "Please add the client follow-up.",
      createdAt: "2026-05-13T21:00:00.000Z",
      author: {
        name: "Riley Reviewer",
        email: "riley@generisgp.com",
      },
    },
  ],
  revisions: [],
};

afterEach(() => {
  cleanup();
  window.history.pushState(null, "", "/");
});

describe("ReportHistory review notes", () => {
  it("opens a linked report and shows reviewer comments to employees", () => {
    render(
      <ReportHistory
        reports={[reportWithComment]}
        initialOpenedReportId="report-1"
      />,
    );

    expect(screen.getByRole("heading", { name: "Daily Report" })).toBeTruthy();
    expect(screen.getByText("Review Notes")).toBeTruthy();
    expect(screen.getByText("Please add the client follow-up.")).toBeTruthy();

    const reviewNotesPanel = screen.getByRole("complementary", {
      name: "Review notes",
    });
    const reportDocument = document.querySelector(".report-pdf-document");
    expect(reviewNotesPanel).toBeTruthy();
    expect(reportDocument).toBeTruthy();
    expect(reportDocument!.textContent).not.toContain("Review Notes");
    expect(reportDocument!.textContent).not.toContain(
      "Please add the client follow-up.",
    );
    expect(reviewNotesPanel.compareDocumentPosition(reportDocument!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      screen.getByRole("region", { name: "Review notes list" }).className,
    ).toContain("report-pdf-comments-list");
  });

  it("does not open a report from the browser URL during hydration", () => {
    window.history.pushState(null, "", "/reports?reportId=report-1");

    render(<ReportHistory reports={[reportWithComment]} />);

    expect(screen.queryByRole("heading", { name: "Daily Report" })).toBeNull();
    expect(
      screen.getByRole("heading", {
        name: "Review your submitted updates",
      }),
    ).toBeTruthy();
  });

  it("shows an empty report list without stranded table headers", () => {
    render(<ReportHistory reports={[]} />);

    expect(
      screen.getByText(
        "No reports match the current filters. Create a report or clear your filters.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Date")).toBeNull();
    expect(screen.queryByText("Status")).toBeNull();
    expect(screen.queryByText("Summary")).toBeNull();
    expect(screen.queryByText("Actions")).toBeNull();
  });

  it("renders the date range picker outside clipped filter containers", () => {
    render(
      <div className="overflow-hidden">
        <ReportHistory reports={[]} />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "All dates" }));

    const dateRangeDialog = screen.getByRole("dialog", {
      name: "Report history date range",
    });

    expect(dateRangeDialog.parentElement).toBe(document.body);
    expect(within(dateRangeDialog).getByLabelText("From")).toBeTruthy();
    expect(within(dateRangeDialog).getByLabelText("To")).toBeTruthy();
  });
});
