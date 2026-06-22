import { describe, expect, it } from "vitest";

import {
  formatImportedActivityTitle,
  isDescriptiveImportedActivityTitle,
} from "@/lib/services/ai-import-quality";

describe("AI import title quality", () => {
  it("strips generic wrappers when a useful task remains", () => {
    expect(formatImportedActivityTitle("Task completed: create program.")).toBe(
      "Create program",
    );
  });

  it("keeps identifiers and useful capitalization intact", () => {
    expect(
      formatImportedActivityTitle("update ESC26 delegate list for FMS26"),
    ).toBe("Update ESC26 delegate list for FMS26");
  });

  it("normalizes mostly uppercase generated titles to sentence case", () => {
    expect(formatImportedActivityTitle("FIX DISAPPEARING SPONSOR INFO")).toBe(
      "Fix disappearing sponsor info",
    );
    expect(
      formatImportedActivityTitle("UPDATE ESC26 DELEGATE LIST FOR FMS26"),
    ).toBe("Update ESC26 delegate list for FMS26");
    expect(formatImportedActivityTitle("FIX UI BUG FOR IT-4298")).toBe(
      "Fix UI bug for IT-4298",
    );
  });

  it("rejects generic titles", () => {
    expect(isDescriptiveImportedActivityTitle("Task completed")).toBe(false);
    expect(isDescriptiveImportedActivityTitle("Noted")).toBe(false);
    expect(isDescriptiveImportedActivityTitle("Work update")).toBe(false);
  });

  it("accepts concise task-specific titles", () => {
    expect(
      isDescriptiveImportedActivityTitle("Fix disappearing sponsor info"),
    ).toBe(true);
    expect(
      isDescriptiveImportedActivityTitle("Update ESC26 delegate list"),
    ).toBe(true);
  });

  it("trims overlong titles at a word boundary", () => {
    const formatted = formatImportedActivityTitle(
      "Coordinate implementation details for the department location calendar and weekly planning controls across the daily report workflow",
    );

    expect(formatted.length).toBeLessThanOrEqual(99);
    expect(formatted.endsWith("...")).toBe(true);
  });
});
