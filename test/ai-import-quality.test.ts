import { describe, expect, it } from "vitest";

import {
  importedActivityStatusOrNull,
  isDescriptiveImportedActivityTitle,
} from "@/lib/services/ai-import-quality";

describe("AI import quality helpers", () => {
  it("accepts concise acronym-based task titles", () => {
    expect(isDescriptiveImportedActivityTitle("UI fix")).toBe(true);
    expect(isDescriptiveImportedActivityTitle("QA review")).toBe(true);
    expect(isDescriptiveImportedActivityTitle("HR sync")).toBe(true);
    expect(isDescriptiveImportedActivityTitle("IT setup")).toBe(true);
  });

  it("rejects generic imported activity titles", () => {
    expect(isDescriptiveImportedActivityTitle("Task completed")).toBe(false);
    expect(isDescriptiveImportedActivityTitle("Work update")).toBe(false);
    expect(isDescriptiveImportedActivityTitle("Status update")).toBe(false);
    expect(isDescriptiveImportedActivityTitle("AI task")).toBe(false);
  });

  it("drops non-actionable imported activity statuses", () => {
    expect(importedActivityStatusOrNull("noted")).toBeNull();
    expect(importedActivityStatusOrNull("Status")).toBeNull();
    expect(importedActivityStatusOrNull("in progress")).toBe("in progress");
    expect(importedActivityStatusOrNull("blocked")).toBe("blocked");
  });
});
