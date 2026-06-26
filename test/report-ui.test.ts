import { describe, expect, it } from "vitest";

import { reportActivityStatusLabel } from "@/components/reports/report-ui";

describe("report UI helpers", () => {
  it("uses one completion label across imported activity statuses", () => {
    expect(reportActivityStatusLabel("complete")).toBe("Done");
    expect(reportActivityStatusLabel("completed")).toBe("Done");
    expect(reportActivityStatusLabel("Done")).toBe("Done");
  });

  it("hides noted statuses unless explicitly requested", () => {
    expect(reportActivityStatusLabel("noted")).toBeNull();
    expect(reportActivityStatusLabel("noted", { showNoted: true })).toBe(
      "Noted",
    );
  });
});
