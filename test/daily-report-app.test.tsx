// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DailyReportApp } from "@/components/reports/daily-report-app";

const { mockRouterPush, mockSignIn } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockSignIn: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    prefetch: vi.fn()
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams()
}));

vi.mock("next-auth/react", () => ({
  signIn: mockSignIn,
  signOut: vi.fn()
}));

vi.mock("next/image", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");

  return {
    default: ({ src, alt, ...props }: { src: string | { src: string }; alt: string }) =>
      ReactModule.createElement("img", {
        ...props,
        src: typeof src === "string" ? src : src.src,
        alt
      })
  };
});

vi.mock("@/components/theme-toggle", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");

  return {
    ThemeToggle: () => ReactModule.createElement("button", { type: "button" }, "Theme")
  };
});

const emptyReport = {
  id: "",
  reportDate: "2026-05-20",
  workLocation: "UNKNOWN" as const,
  summary: "",
  blockers: "",
  status: "DRAFT" as const,
  submittedAt: null,
  updatedAt: null,
  activities: [],
  revisions: []
};

const importedTask = {
  id: "task-1",
  source: "GOOGLE_TASKS" as const,
  title: "Imported task",
  description: null,
  status: "completed",
  sourceUrl: "#",
  startedAt: "2026-05-20T14:00:00.000Z",
  durationMinutes: null,
  selected: true,
  employeeNote: null
};

function renderDailyReportApp() {
  return render(
    <DailyReportApp
      initialReport={emptyReport}
      date="2026-05-20"
      userName="Employee"
      userEmail="employee@generisgp.com"
      userRole="Employee"
      userStatus="ACTIVE"
      timezone="America/Toronto"
      integrationStatus={{ google: true, atlassian: false }}
      oauthConfig={{ google: true, atlassian: false }}
    />
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DailyReportApp", () => {
  it("treats imported activities as unsaved changes and warns before refresh", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/sync/google-tasks")) {
        return Response.json({ importedCount: 1, skippedCount: 0, staleCount: 0, activities: [importedTask] });
      }

      return Response.json({ error: "Unexpected request." }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    expect(screen.getByText("No saved draft")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.click(screen.getByRole("button", { name: "Import Tasks" }));

    await waitFor(() => {
      expect(screen.getByText("Unsaved changes")).toBeTruthy();
    });
    expect(screen.getByText("Imported task")).toBeTruthy();

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);

    expect(beforeUnload.defaultPrevented).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/activity"))).toBe(false);

    await screen.findByText(/Tasks import complete/);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }));

    expect(screen.queryByText(/Tasks import complete/)).toBeNull();
  });

  it("keeps save and submit labels stable while an import is running", async () => {
    const sync = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/sync/google-tasks")) {
        return sync.promise;
      }

      return Promise.resolve(Response.json({ error: "Unexpected request." }, { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.click(screen.getByRole("button", { name: "Import Tasks" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Importing tasks..." })).toBeTruthy();
    });

    expect(screen.getByRole("button", { name: "Save draft" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Submit update" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText("Saving...")).toBeNull();
    expect(screen.queryByText("Submitting...")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();

    sync.resolve(Response.json({ importedCount: 1, skippedCount: 0, staleCount: 0, activities: [importedTask] }));

    await waitFor(() => {
      expect(screen.getByText("Imported task")).toBeTruthy();
    });
  });
});
