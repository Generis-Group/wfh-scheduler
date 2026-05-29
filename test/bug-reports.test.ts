import { describe, expect, it } from "vitest";

import { canReviewBugReports } from "@/lib/services/bug-reports";

describe("bug report service", () => {
  it("uses admin role access for the shared bug report inbox", () => {
    expect(canReviewBugReports({ role: "ADMIN", roles: ["ADMIN"] })).toBe(
      true,
    );
    expect(
      canReviewBugReports({ role: "REVIEWER", roles: ["REVIEWER"] }),
    ).toBe(false);
    expect(
      canReviewBugReports({ role: "EMPLOYEE", roles: ["EMPLOYEE"] }),
    ).toBe(false);
  });
});
