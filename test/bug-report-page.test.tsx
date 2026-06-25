// @vitest-environment jsdom

import React from "react";
import {
  act,
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
  vi.restoreAllMocks();
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

    const openList = screen
      .getByRole("heading", { name: "Open bug reports" })
      .closest(".reference-card") as HTMLElement;

    expect(within(openList).getByText("Blank page after save.")).toBeTruthy();
    expect(screen.queryByText("Screenshot upload was failing.")).toBeNull();

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
    expect(
      within(archive).getByRole("button", { name: "Reopen" }),
    ).toBeTruthy();
  });

  it("lets admins delete bug reports from the report popup", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <BugReportPage
        initialReports={[openReport]}
        canReviewAll
        currentUserName="Admin"
        initialSelectedReportId={openReport.id}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bug-reports/bug-open",
      expect.objectContaining({ method: "DELETE" }),
    );
    await waitFor(() =>
      expect(screen.getByText("No open bug reports.")).toBeTruthy(),
    );
  });

  it("shows a readable source page instead of a raw date route", () => {
    render(
      <BugReportPage
        initialReports={[
          {
            ...openReport,
            pagePath: "/?date=2026-06-24",
          },
        ]}
        canReviewAll
        currentUserName="Admin"
        initialSelectedReportId={openReport.id}
      />,
    );

    expect(screen.getByText("Daily update, Jun 24, 2026")).toBeTruthy();
    expect(screen.queryByText("/?date=2026-06-24")).toBeNull();
  });

  it("keeps a dismissed direct-linked report closed after screenshots load", async () => {
    const reportWithPendingAttachment = {
      ...openReport,
      attachments: [
        {
          id: "bug-attachment-1",
          fileName: "screenshot.png",
          contentType: "image/png",
          sizeBytes: 128,
          createdAt: "2026-05-29T15:01:00.000Z",
        },
      ],
    };
    const reportWithLoadedAttachment = {
      ...reportWithPendingAttachment,
      attachments: [
        {
          ...reportWithPendingAttachment.attachments[0],
          dataUrl: "data:image/png;base64,c2NyZWVuc2hvdA==",
        },
      ],
    };
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BugReportPage
        initialReports={[reportWithPendingAttachment]}
        canReviewAll
        currentUserName="Admin"
        initialSelectedReportId={openReport.id}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Bug report detail" }),
    ).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Close bug report" }));
    expect(
      screen.queryByRole("dialog", { name: "Bug report detail" }),
    ).toBeNull();

    await act(async () => {
      resolveFetch(Response.json({ bugReport: reportWithLoadedAttachment }));
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Bug report detail" }),
      ).toBeNull(),
    );
  });

  it("keeps open reports in an internally scrolling list", () => {
    const manyReports = Array.from({ length: 24 }, (_, index) => ({
      ...openReport,
      id: `bug-open-${index}`,
      body: `Open bug report ${index + 1}`,
      createdAt: `2026-05-${String(1 + (index % 28)).padStart(2, "0")}T15:00:00.000Z`,
    }));

    render(
      <BugReportPage
        initialReports={manyReports}
        canReviewAll
        currentUserName="Admin"
      />,
    );

    const reportList = screen
      .getByRole("button", { name: /Open bug report 24/ })
      .parentElement as HTMLElement;

    expect(reportList.className).toContain("overflow-y-auto");
    expect(reportList.className).toContain("overscroll-contain");
    expect(reportList.className).toContain("[scrollbar-gutter:stable]");
  });

  it("prevents oversized bug reports from being submitted", () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BugReportPage
        initialReports={[]}
        canReviewAll={false}
        currentUserName="Alex Employee"
      />,
    );

    const longReport = Array.from({ length: 751 }, () => "a").join(" ");

    fireEvent.change(screen.getByLabelText("Bug report text"), {
      target: { value: longReport },
    });

    expect(screen.getByText("751 / 750 words")).toBeTruthy();

    const sendButton = screen.getByRole("button", { name: "Send report" });

    expect((sendButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(sendButton);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
