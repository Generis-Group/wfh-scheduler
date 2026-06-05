import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("pagination standards", () => {
  it("keeps list pagination on the shared control instead of load-more buttons", () => {
    const listFiles = [
      path.join(root, "components", "reports", "report-history.tsx"),
      path.join(root, "components", "bugs", "bug-report-page.tsx"),
      path.join(root, "components", "admin", "admin-users.tsx"),
      path.join(root, "components", "admin", "admin-reports-manager.tsx"),
      path.join(root, "components", "reports", "reviewer-dashboard.tsx"),
    ];

    for (const file of listFiles) {
      const source = fs.readFileSync(file, "utf8");

      expect(source, file).toContain("PaginationControls");
      expect(source, file).not.toContain("Load more");
      expect(source, file).not.toContain("Load older");
    }
  });
});
