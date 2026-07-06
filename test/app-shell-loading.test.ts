// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";

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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPathname,
  mockRouterPrefetch,
  mockRouterPush,
  mockRouterRefresh,
  mockSearchParams,
} = vi.hoisted(() => ({
  mockPathname: { current: "/" },
  mockRouterPrefetch: vi.fn(),
  mockRouterPush: vi.fn(),
  mockRouterRefresh: vi.fn(),
  mockSearchParams: { current: "" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.current,
  useRouter: () => ({
    prefetch: mockRouterPrefetch,
    push: mockRouterPush,
    refresh: mockRouterRefresh,
  }),
  useSearchParams: () => new URLSearchParams(mockSearchParams.current),
}));

vi.mock("next/link", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");

  return {
    default: ({
      children,
      href,
      onClick,
      prefetch: _prefetch,
      ...props
    }: {
      children: React.ReactNode;
      href: string | URL;
      onClick?: React.MouseEventHandler<HTMLAnchorElement>;
      prefetch?: boolean;
    }) =>
      ReactModule.createElement(
        "a",
        {
          ...props,
          href: String(href),
          onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
            onClick?.(event);
            event.preventDefault();
          },
        },
        children,
      ),
  };
});

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("next/image", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");

  return {
    default: ({
      alt,
      priority: _priority,
      src,
      ...props
    }: {
      alt: string;
      priority?: boolean;
      src: string | { src?: string };
    }) =>
      ReactModule.createElement("img", {
        ...props,
        alt,
        src: typeof src === "string" ? src : (src.src ?? ""),
      }),
  };
});

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

import {
  activeNavKey,
  ReferenceAppShell,
  shellPageKindFromHref,
} from "@/components/reports/reference-shell";
import { loadingKindFromHref } from "@/components/reports/page-loading-skeleton";
import { markServerDataStale } from "@/lib/client-cache-invalidation";
import { todayDateString } from "@/lib/dates";

const root = process.cwd();

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete window.__generisServerDataVersion;
  delete window.__generisServerDataFreshVersion;
  mockPathname.current = "/";
  mockSearchParams.current = "";
  vi.clearAllMocks();
});

function walkFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return walkFiles(fullPath);
    }

    return [fullPath];
  });
}

function referenceShellElement(
  children: React.ReactNode = "Current page content",
  variant: "employee" | "reviewer" | "admin" = "employee",
  userRoles?: string[],
) {
  const userRole =
    variant === "admin"
      ? "Admin"
      : variant === "reviewer"
        ? "Reviewer"
        : "Employee";

  return React.createElement(ReferenceAppShell, {
    variant,
    displayName: "Test User",
    userEmail: "test@example.com",
    userRole,
    userRoles,
    mustChangePassword: false,
    children: React.createElement("div", null, children),
  });
}

function renderReferenceShell(
  children: React.ReactNode = "Current page content",
  variant: "employee" | "reviewer" | "admin" = "employee",
  userRoles?: string[],
) {
  return render(referenceShellElement(children, variant, userRoles));
}

function uniqueLinkHrefs(name: string) {
  return Array.from(
    new Set(
      screen
        .getAllByRole("link", { name })
        .map((link) => link.getAttribute("href")),
    ),
  );
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

  it("does not block the root document on session lookup before loading UI can stream", () => {
    const rootLayoutSource = fs.readFileSync(
      path.join(root, "app", "layout.tsx"),
      "utf8",
    );

    expect(rootLayoutSource).not.toContain("@/lib/auth");
    expect(rootLayoutSource).not.toContain("auth()");
  });

  it("does not use a full-shell skeleton fallback for authenticated routes", () => {
    const appLayoutSource = fs.readFileSync(
      path.join(root, "app", "(app)", "layout.tsx"),
      "utf8",
    );

    expect(appLayoutSource).not.toContain("<Suspense");
    expect(appLayoutSource).not.toContain("AppShellLoadingFallback");
    expect(appLayoutSource).not.toContain("fallback=");
  });

  it("keeps uploaded profile images available in the app shell", () => {
    const appLayoutSource = fs.readFileSync(
      path.join(root, "app", "(app)", "layout.tsx"),
      "utf8",
    );

    expect(appLayoutSource).toContain("prisma.user.findUnique");
    expect(appLayoutSource).toContain("select: { image: true }");
    expect(appLayoutSource).toContain("profileImage={profileImage}");
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
    expect(activeNavKey("/review")).toBe("review");
    expect(activeNavKey("/admin")).toBe("admin");
    expect(activeNavKey("/bugs")).toBe("bugs");
    expect(activeNavKey("/settings")).toBe("settings");
    expect(activeNavKey("/account")).toBe("settings");
  });

  it("maps shell routes to stable destination skeletons", () => {
    expect(shellPageKindFromHref("/", "employee")).toBe("daily");
    expect(shellPageKindFromHref("/reports", "employee")).toBe("reports");
    expect(shellPageKindFromHref("/review", "reviewer")).toBe("review");
    expect(shellPageKindFromHref("/admin", "admin")).toBe("admin-team");
    expect(shellPageKindFromHref("/admin/team", "admin")).toBe("admin-team");
    expect(loadingKindFromHref("/admin/team", "admin")).toBe("admin-team");
    expect(loadingKindFromHref("/admin/departments", "admin")).toBe(
      "admin-departments",
    );
    expect(loadingKindFromHref("/admin/reports", "admin")).toBe(
      "admin-reports",
    );
    expect(shellPageKindFromHref("/bugs", "employee")).toBe("bugs");
    expect(shellPageKindFromHref("/settings#account", "employee")).toBe(
      "settings-account",
    );
    expect(shellPageKindFromHref("/settings#integrations", "employee")).toBe(
      "settings-integrations",
    );
    expect(shellPageKindFromHref("/change-password", "employee")).toBeNull();
  });

  it("switches nav first and shows the destination skeleton during shell navigation", () => {
    renderReferenceShell();

    const reportsLink = screen.getAllByRole("link", {
      name: "My reports",
    })[0];

    fireEvent.click(reportsLink);

    expect(mockRouterPush).toHaveBeenCalledWith("/reports");
    expect(reportsLink.className).toContain("bg-primary-subtle");
    expect(screen.queryByText("Current page content")).toBeNull();
    expect(screen.getByLabelText("Loading page")).toBeTruthy();
    expect(
      document.querySelector(".reference-route-progress-bar"),
    ).toBeTruthy();
    expect(
      document
        .querySelector(".reference-content-scroll")
        ?.getAttribute("aria-busy"),
    ).toBe("true");
  });

  it("refreshes stale server data only after the destination route is active", async () => {
    const view = renderReferenceShell();
    act(() => {
      markServerDataStale();
    });

    fireEvent.click(screen.getAllByRole("link", { name: "Settings" })[0]);

    expect(mockRouterPush).toHaveBeenCalledWith("/settings");
    expect(mockRouterRefresh).not.toHaveBeenCalled();
    expect(window.__generisServerDataFreshVersion).not.toBe(
      window.__generisServerDataVersion,
    );
    expect(screen.getByLabelText("Loading page")).toBeTruthy();

    mockPathname.current = "/settings";
    view.rerender(referenceShellElement("Settings page content"));

    await waitFor(() => {
      expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
    });
    expect(window.__generisServerDataFreshVersion).toBe(
      window.__generisServerDataVersion,
    );
  });

  it("shows review access for reviewers and admins", () => {
    renderReferenceShell("Current page content", "reviewer");

    expect(
      screen.getAllByRole("link", { name: "Team review" }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();

    cleanup();

    renderReferenceShell("Current page content", "admin");

    expect(uniqueLinkHrefs("Team review")).toEqual(["/review"]);
    expect(uniqueLinkHrefs("Admin")).toEqual(["/admin/team"]);
  });

  it("shows all relevant nav destinations for multi-role users", () => {
    renderReferenceShell("Current page content", "employee", [
      "EMPLOYEE",
      "REVIEWER",
      "ADMIN",
    ]);

    const primaryNav = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(
      within(primaryNav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "Daily update",
      "My reports",
      "Locations",
      "Team review",
      "Admin",
      "Bug reports",
      "Settings",
    ]);

    expect(uniqueLinkHrefs("Daily update")).toEqual([
      `/?date=${todayDateString()}`,
    ]);
    expect(uniqueLinkHrefs("My reports")).toEqual(["/reports"]);
    expect(uniqueLinkHrefs("Locations")).toEqual(["/calendar"]);
    expect(uniqueLinkHrefs("Team review")).toEqual(["/review"]);
    expect(uniqueLinkHrefs("Admin")).toEqual(["/admin/team"]);
    expect(uniqueLinkHrefs("Bug reports")).toEqual(["/bugs?from=%2F"]);
    expect(uniqueLinkHrefs("Settings")).toEqual(["/settings"]);
  });

  it("renders the profile menu outside clipped shell containers", () => {
    render(
      React.createElement(
        "div",
        { className: "overflow-hidden" },
        referenceShellElement(),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /Test User/ }));

    const menu = screen.getByRole("menu", { name: "Profile menu" });

    expect(menu.parentElement).toBe(document.body);
    expect(
      within(menu).getByRole("link", { name: "Account settings" }),
    ).toBeTruthy();
  });

  it("carries the current page into bug report navigation", () => {
    mockPathname.current = "/reports";
    mockSearchParams.current = "date=2026-05-27";

    renderReferenceShell();

    expect(uniqueLinkHrefs("Bug reports")).toEqual([
      "/bugs?from=%2Freports%3Fdate%3D2026-05-27",
    ]);
  });

  it("persists reviewer dates for multi-role employee shells", async () => {
    mockPathname.current = "/review";
    mockSearchParams.current = "date=2026-05-19";

    renderReferenceShell("Current page content", "employee", [
      "EMPLOYEE",
      "REVIEWER",
    ]);

    await waitFor(() => {
      expect(window.localStorage.getItem("generis.lastReviewDate")).toBe(
        "2026-05-19",
      );
      expect(uniqueLinkHrefs("Team review")).toEqual([
        "/review?date=2026-05-19",
      ]);
    });
  });

  it("keeps the destination skeleton visible until the route commit arrives", () => {
    vi.useFakeTimers();

    try {
      renderReferenceShell("Settings page content");

      fireEvent.click(screen.getAllByRole("link", { name: "My reports" })[0]);

      act(() => {
        vi.advanceTimersByTime(15_000);
      });

      expect(screen.queryByText("Settings page content")).toBeNull();
      expect(screen.getByLabelText("Loading page")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores stale saved dashboard dates so the server resolves today", () => {
    window.localStorage.setItem("generis.lastReportDate", "2026-05-20");
    window.localStorage.setItem("generis.lastReviewDate", "2026-05-20");
    mockPathname.current = "/reports";

    renderReferenceShell();

    expect(uniqueLinkHrefs("Daily update")).toEqual(["/"]);

    cleanup();
    mockPathname.current = "/admin";

    renderReferenceShell("Current page content", "admin");

    expect(uniqueLinkHrefs("Team review")).toEqual(["/review"]);
    expect(uniqueLinkHrefs("Generis")).toEqual(["/admin/team"]);
  });

  it("persists fresh dashboard dates across shell navigation", async () => {
    window.localStorage.setItem("generis.lastReportDate", "2026-05-20");
    window.localStorage.setItem(
      "generis.lastReportDateSavedOn",
      todayDateString(),
    );
    mockPathname.current = "/reports";

    renderReferenceShell();

    await waitFor(() => {
      expect(uniqueLinkHrefs("Daily update")).toEqual(["/?date=2026-05-20"]);
    });

    cleanup();
    window.localStorage.setItem("generis.lastReviewDate", "2026-05-19");
    window.localStorage.setItem(
      "generis.lastReviewDateSavedOn",
      todayDateString(),
    );
    mockPathname.current = "/admin";

    renderReferenceShell("Current page content", "admin", [
      "REVIEWER",
      "ADMIN",
    ]);

    await waitFor(() => {
      expect(uniqueLinkHrefs("Team review")).toEqual([
        "/review?date=2026-05-19",
      ]);
      expect(uniqueLinkHrefs("Generis")).toEqual(["/review?date=2026-05-19"]);
    });
  });

  it("navigates when only the route query changes", async () => {
    mockPathname.current = "/admin/team";
    mockSearchParams.current = "tab=old";

    renderReferenceShell("Current page content", "admin");

    fireEvent.click(screen.getAllByRole("link", { name: "Admin" })[0]);

    expect(mockRouterPush).toHaveBeenCalledWith("/admin/team");
  });

  it("links admins directly to the team page and shows the admin skeleton immediately", () => {
    mockPathname.current = "/bugs";

    renderReferenceShell("Bug page content", "admin");

    const adminLink = screen.getAllByRole("link", { name: "Admin" })[0];

    fireEvent.click(adminLink);

    expect(mockRouterPush).toHaveBeenCalledWith("/admin/team");
    expect(adminLink.className).toContain("bg-primary-subtle");
    expect(screen.queryByText("Bug page content")).toBeNull();
    expect(screen.getByLabelText("Loading page")).toBeTruthy();
    expect(
      document
        .querySelector(".reference-content-scroll")
        ?.getAttribute("aria-busy"),
    ).toBe("true");
  });

  it("keeps app scrolling inside the page content pane", () => {
    const shellSource = fs.readFileSync(
      path.join(root, "components", "reports", "reference-shell.tsx"),
      "utf8",
    );

    expect(shellSource).toContain("reference-content-scroll");
    expect(shellSource).toMatch(/h-\[100dvh\].*min-h-0.*overflow-hidden/);
    expect(shellSource).toContain(
      "reference-content-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain",
    );
    expect(shellSource).toContain(
      "resetContentScroll(contentScrollRef.current)",
    );
  });

  it("uses a desktop sidebar and mobile drawer without runtime width measuring", () => {
    const shellSource = fs.readFileSync(
      path.join(root, "components", "reports", "reference-shell.tsx"),
      "utf8",
    );

    expect(shellSource).toContain("w-60 shrink-0 flex-col");
    expect(shellSource).toContain('aria-label="Mobile navigation"');
    expect(shellSource).toContain("xl:flex");
    expect(shellSource).toContain("xl:hidden");
    expect(shellSource).not.toContain("ResizeObserver");
    expect(shellSource).not.toContain("scrollWidth");
    expect(shellSource).not.toContain("clientWidth");
    expect(shellSource).not.toContain("useCompactNav");
  });

  it("does not server-load slow provider metadata on the settings page", () => {
    const settingsPageSource = fs.readFileSync(
      path.join(root, "app", "(app)", "settings", "page.tsx"),
      "utf8",
    );

    expect(settingsPageSource).not.toContain("getGoogleServices");
    expect(settingsPageSource).not.toContain("listJiraResources");
  });

  it("keeps slow app routes out of eager shell prefetch", () => {
    const shellSource = fs.readFileSync(
      path.join(root, "components", "reports", "reference-shell.tsx"),
      "utf8",
    );

    expect(shellSource).toContain('href: "/settings"');
    expect(shellSource).toContain("href: defaultAdminHref");
    expect(shellSource).toContain('prefetch: "intent"');
    expect(shellSource).toContain('item.prefetch === "eager"');
  });
});
