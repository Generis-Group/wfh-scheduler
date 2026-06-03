import { describe, expect, it } from "vitest";

import { hasSubmitReadyContent } from "@/lib/report-submit-readiness";

describe("hasSubmitReadyContent", () => {
  it("rejects a blank default report", () => {
    expect(
      hasSubmitReadyContent({
        summary: "",
        workLocation: "UNKNOWN",
        activities: [],
        manualActivities: [],
      }),
    ).toBe(false);
  });

  it("does not treat normal work locations as content on their own", () => {
    expect(
      hasSubmitReadyContent({
        summary: "",
        workLocation: "OFFICE",
        activities: [],
        manualActivities: [],
      }),
    ).toBe(false);
  });

  it("accepts a written summary", () => {
    expect(
      hasSubmitReadyContent({
        summary: "Finished the rollout note.",
        workLocation: "UNKNOWN",
      }),
    ).toBe(true);
  });

  it("accepts selected work items", () => {
    expect(
      hasSubmitReadyContent({
        summary: "",
        workLocation: "UNKNOWN",
        activities: [{ selected: true }],
      }),
    ).toBe(true);
  });

  it("ignores unselected work items", () => {
    expect(
      hasSubmitReadyContent({
        summary: "",
        workLocation: "UNKNOWN",
        activities: [{ selected: false }],
      }),
    ).toBe(false);
  });

  it("accepts newly added manual work items", () => {
    expect(
      hasSubmitReadyContent({
        summary: "",
        workLocation: "UNKNOWN",
        manualActivities: [{ title: "Manual follow-up" }],
      }),
    ).toBe(true);
  });

  it("accepts deliberate non-work locations", () => {
    expect(
      hasSubmitReadyContent({
        summary: "",
        workLocation: "PTO",
      }),
    ).toBe(true);
    expect(
      hasSubmitReadyContent({
        summary: "",
        workLocation: "OUT_OF_OFFICE",
      }),
    ).toBe(true);
  });
});
