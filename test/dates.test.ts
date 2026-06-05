import { describe, expect, it } from "vitest";

import { isValidReportDateString } from "@/lib/dates";

describe("report date validation", () => {
  it("rejects date-shaped values that are not real calendar dates", () => {
    expect(isValidReportDateString("2026-06-05")).toBe(true);
    expect(isValidReportDateString("2026-99-99")).toBe(false);
    expect(isValidReportDateString("2026-02-31")).toBe(false);
    expect(isValidReportDateString("not-a-date")).toBe(false);
  });
});
