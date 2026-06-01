// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SummaryRenderer } from "@/components/reports/summary-renderer";
import { summaryActivityReferenceHref } from "@/lib/summary-format";

afterEach(() => {
  cleanup();
});

describe("SummaryRenderer", () => {
  it("renders summary activity references as external links", () => {
    render(
      <SummaryRenderer value="[Imported task](https://example.com/tasks/123)" />,
    );

    const link = screen.getByRole("link", { name: "Imported task" });

    expect(link.getAttribute("href")).toBe("https://example.com/tasks/123");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(
      link.querySelector(".summary-activity-reference-card")?.getAttribute(
        "data-source",
      ),
    ).toBe("UNKNOWN");
  });

  it("renders internal summary activity references as source-aware cards", () => {
    const href = summaryActivityReferenceHref("activity-1", "GOOGLE_TASKS");

    render(<SummaryRenderer value={`[Imported task](${href})`} />);

    expect(screen.queryByRole("link", { name: "Imported task" })).toBeNull();
    expect(screen.getByText("Imported task").closest("span")).not.toBeNull();
    expect(
      document
        .querySelector(".summary-activity-reference-card")
      ?.getAttribute("data-source"),
    ).toBe("GOOGLE_TASKS");
  });

  it("links internal activity references when a source URL is available", () => {
    const href = summaryActivityReferenceHref("activity-1", "JIRA");

    render(
      <SummaryRenderer
        value={`[Imported task](${href})`}
        activityReferences={{
          "activity-1": {
            href: "https://generisgp.atlassian.net/browse/IT-3027",
            source: "JIRA",
            title: "Imported task",
          },
        }}
      />,
    );

    const link = screen.getByRole("link", { name: "Imported task" });

    expect(link.getAttribute("href")).toBe(
      "https://generisgp.atlassian.net/browse/IT-3027",
    );
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("uses current activity titles for internal references", () => {
    const href = summaryActivityReferenceHref("activity-1", "JIRA");

    render(
      <SummaryRenderer
        value={`[Old task title](${href})`}
        activityReferences={{
          "activity-1": {
            href: "https://generisgp.atlassian.net/browse/IT-3027",
            source: "JIRA",
            title: "Renamed task title",
          },
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Renamed task title" }),
    ).toBeTruthy();
    expect(screen.queryByText("Old task title")).toBeNull();
  });

  it("preserves ordered list starts after activity references interrupt the list", () => {
    const href = summaryActivityReferenceHref("activity-1", "JIRA");

    render(
      <SummaryRenderer
        value={[
          "1. First task",
          "2. Second task",
          `[Imported task](${href})`,
          "3. Third task",
        ].join("\n")}
      />,
    );

    const orderedLists = Array.from(document.querySelectorAll("ol"));

    expect(orderedLists).toHaveLength(2);
    expect(orderedLists[0].getAttribute("start")).toBeNull();
    expect(orderedLists[1].getAttribute("start")).toBe("3");
  });

});
