// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("heading", { name: "Reports" })).toBeTruthy();
  });
});
