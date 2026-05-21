import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ prefetch: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: "img",
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

import {
  activeNavKey,
  resolveLastReportDate,
} from "@/components/reports/reference-shell";

const root = process.cwd();

function walkFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return walkFiles(fullPath);
    }

    return [fullPath];
  });
}

describe("authenticated app shell loading boundaries", () => {
  it("keeps authenticated route loading files scoped to page content", () => {
    const loadingFiles = walkFiles(path.join(root, "app", "(app)")).filter(
      (file) => file.endsWith(`${path.sep}loading.tsx`),
    );

    expect(loadingFiles.length).toBeGreaterThan(0);

    for (const file of loadingFiles) {
      const source = fs.readFileSync(file, "utf8");

      expect(source, file).not.toContain("ReferenceAppShell");
      expect(source, file).not.toContain("route-loading");
    }
  });

  it("does not keep role-placeholder names in app code", () => {
    const sourceFiles = [
      ...walkFiles(path.join(root, "app")),
      ...walkFiles(path.join(root, "components")),
    ].filter((file) => /\.(ts|tsx)$/.test(file));

    for (const file of sourceFiles) {
      const source = fs.readFileSync(file, "utf8");

      expect(source, file).not.toContain("Employee User");
      expect(source, file).not.toContain("Admin User");
    }
  });

  it("maps routes to stable nav keys", () => {
    expect(activeNavKey("/")).toBe("report");
    expect(activeNavKey("/reports")).toBe("reports");
    expect(activeNavKey("/history")).toBe("reports");
    expect(activeNavKey("/review")).toBe("review");
    expect(activeNavKey("/coo")).toBe("review");
    expect(activeNavKey("/admin")).toBe("employees");
    expect(activeNavKey("/settings")).toBe("settings");
    expect(activeNavKey("/account")).toBe("account");
  });

  it("prefers the daily route date before falling back to the saved report date", () => {
    expect(resolveLastReportDate("/", "2026-05-21", "2026-05-20")).toBe(
      "2026-05-21",
    );
    expect(resolveLastReportDate("/reports", null, "2026-05-20")).toBe(
      "2026-05-20",
    );
    expect(resolveLastReportDate("/", null, null)).toBeNull();
  });

  it("keeps desktop scrolling inside the page content pane", () => {
    const shellSource = fs.readFileSync(
      path.join(root, "components", "reports", "reference-shell.tsx"),
      "utf8",
    );

    expect(shellSource).toContain("reference-content-scroll");
    expect(shellSource).toContain("lg:overflow-y-auto");
    expect(shellSource).toContain("lg:h-screen lg:overflow-hidden");
    expect(shellSource).toContain(
      "resetContentScroll(contentScrollRef.current)",
    );
  });
});
