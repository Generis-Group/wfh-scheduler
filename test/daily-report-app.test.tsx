// @vitest-environment jsdom

import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRouterPush, mockRouterRefresh, mockSignIn } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockRouterRefresh: vi.fn(),
  mockSignIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    prefetch: vi.fn(),
    refresh: mockRouterRefresh,
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  signIn: mockSignIn,
  signOut: vi.fn(),
}));

vi.mock("next/image", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");

  return {
    default: ({
      src,
      alt,
      priority: _priority,
      ...props
    }: {
      src: string | { src: string };
      alt: string;
      priority?: boolean;
    }) =>
      ReactModule.createElement("img", {
        ...props,
        src: typeof src === "string" ? src : src.src,
        alt,
      }),
  };
});

vi.mock("@/components/theme-toggle", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");

  return {
    ThemeToggle: () =>
      ReactModule.createElement("button", { type: "button" }, "Theme"),
  };
});

vi.mock("@/components/reports/summary-editor", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  type Snapshot = { summary: string; blockers: string };

  return {
    SummaryEditor: ReactModule.forwardRef(function MockSummaryEditor(
      {
        initialSummary,
        initialBlockers,
        resetKey,
        onChange,
      }: {
        initialSummary: string;
        initialBlockers: string;
        resetKey: string;
        onChange: (snapshot: Snapshot) => void;
      },
      ref,
    ) {
      const [snapshot, setSnapshot] = ReactModule.useState<Snapshot>({
        summary: initialSummary,
        blockers: initialBlockers,
      });
      const snapshotRef = ReactModule.useRef(snapshot);
      const onChangeRef = ReactModule.useRef(onChange);

      ReactModule.useEffect(() => {
        onChangeRef.current = onChange;
      }, [onChange]);

      ReactModule.useEffect(() => {
        const next = { summary: initialSummary, blockers: initialBlockers };
        snapshotRef.current = next;
        setSnapshot(next);
        onChangeRef.current(next);
      }, [initialSummary, initialBlockers, resetKey]);

      ReactModule.useImperativeHandle(ref, () => ({
        getSnapshot: () => snapshotRef.current,
        setSnapshot: (next: Snapshot) => {
          snapshotRef.current = next;
          setSnapshot(next);
          onChangeRef.current(next);
        },
      }));

      return ReactModule.createElement("textarea", {
        "aria-label": "Summary",
        value: snapshot.summary,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
          const next = { ...snapshotRef.current, summary: event.target.value };
          snapshotRef.current = next;
          setSnapshot(next);
          onChangeRef.current(next);
        },
      });
    }),
  };
});

import { DailyReportApp } from "@/components/reports/daily-report-app";

type DailyReportProps = React.ComponentProps<typeof DailyReportApp>;

const emptyReport: DailyReportProps["initialReport"] = {
  id: "",
  reportDate: "2026-05-20",
  workLocation: "UNKNOWN" as const,
  summary: "",
  blockers: "",
  status: "DRAFT" as const,
  submittedAt: null,
  updatedAt: null,
  activities: [],
  revisions: [],
};

const savedDraft: DailyReportProps["initialReport"] = {
  ...emptyReport,
  id: "report-1",
  updatedAt: "2026-05-20T14:00:00.000Z",
};

const submittedReport: DailyReportProps["initialReport"] = {
  ...savedDraft,
  status: "SUBMITTED" as const,
  submittedAt: "2026-05-20T14:10:00.000Z",
};

const importedTask: DailyReportProps["initialReport"]["activities"][number] = {
  id: "task-1",
  source: "GOOGLE_TASKS" as const,
  title: "Imported task",
  description: null,
  status: "completed",
  sourceUrl: "#",
  startedAt: "2026-05-20T14:00:00.000Z",
  durationMinutes: null,
  selected: true,
  employeeNote: null,
};

function renderDailyReportApp(
  initialReport: DailyReportProps["initialReport"] = emptyReport,
) {
  return render(
    <DailyReportApp
      initialReport={initialReport}
      date="2026-05-20"
      integrationStatus={{ google: true, atlassian: false }}
      oauthConfig={{ google: true, atlassian: false }}
    />,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}

async function advanceAutoSave() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DailyReportApp auto-draft", () => {
  it("auto-creates a draft after editing summary", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/reports") {
        return Response.json(
          { report: { ...savedDraft, summary: "Finished the rollout note" } },
          { status: 201 },
        );
      }

      return Response.json({ error: "Unexpected request." }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: "Finished the rollout note" },
    });
    await advanceAutoSave();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Finished the rollout note"),
      }),
    );
    expect(screen.queryByText("Saved")).toBeNull();
    expect(screen.getByText("Draft")).toBeTruthy();
  });

  it("imports tasks and autosaves the imported work item", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/sync/google-tasks")) {
        return Response.json({
          importedCount: 1,
          skippedCount: 0,
          staleCount: 0,
          activities: [importedTask],
        });
      }

      if (url === "/api/reports") {
        return Response.json(
          { report: { ...savedDraft, activities: [importedTask] } },
          { status: 201 },
        );
      }

      return Response.json({ error: "Unexpected request." }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.click(screen.getByRole("button", { name: "Import Tasks" }));

    await flushReact();
    expect(screen.getByText("Imported task")).toBeTruthy();
    await advanceAutoSave();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("task-1"),
      }),
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/api/activity"),
      ),
    ).toBe(false);
  });

  it("coalesces rapid edits into one debounced save", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json(
          { report: { ...savedDraft, summary: "Second edit" } },
          { status: 201 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    const summaryBox = screen.getByRole("textbox", { name: "Summary" });
    fireEvent.change(summaryBox, { target: { value: "First edit" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    fireEvent.change(summaryBox, { target: { value: "Second edit" } });
    await advanceAutoSave();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ body: expect.stringContaining("Second edit") }),
    );
  });

  it("queues a follow-up save when edits happen during an in-flight save", async () => {
    vi.useFakeTimers();
    const firstSave = deferred<Response>();
    const secondSave = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/reports") {
        return firstSave.promise;
      }

      if (url === "/api/reports/report-1") {
        return secondSave.promise;
      }

      return Promise.resolve(
        Response.json({ error: "Unexpected request." }, { status: 500 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    const summaryBox = screen.getByRole("textbox", { name: "Summary" });
    fireEvent.change(summaryBox, { target: { value: "First edit" } });
    await advanceAutoSave();
    fireEvent.change(summaryBox, { target: { value: "Second edit" } });

    firstSave.resolve(
      Response.json(
        { report: { ...savedDraft, summary: "First edit" } },
        { status: 201 },
      ),
    );
    await flushReact();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports/report-1",
      expect.objectContaining({ method: "PUT" }),
    );
    secondSave.resolve(
      Response.json({ report: { ...savedDraft, summary: "Second edit" } }),
    );
    await flushReact();

    expect(
      (screen.getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement)
        .value,
    ).toBe("Second edit");
  });

  it("blocks date navigation when the autosave flush fails", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () =>
      Response.json({ error: "Nope" }, { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: "Needs saving" },
    });
    fireEvent.change(screen.getByLabelText("Select report date"), {
      target: { value: "2026-05-21" },
    });

    await flushReact();
    expect(screen.getByText("Save failed")).toBeTruthy();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("shows immediate feedback while date navigation is pending", async () => {
    renderDailyReportApp(savedDraft);

    const previousDayButton = screen.getByRole("button", {
      name: "Previous day",
    });
    fireEvent.click(previousDayButton);

    expect(previousDayButton.querySelector(".animate-spin")).toBeTruthy();

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/?date=2026-05-19");
    });
  });

  it("creates a draft before submitting a new report", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/reports") {
        return Response.json({ report: savedDraft }, { status: 201 });
      }

      if (url === "/api/reports/report-1/submit") {
        return Response.json({ report: submittedReport });
      }

      return Response.json({ error: "Unexpected request." }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    fireEvent.click(screen.getByRole("button", { name: "Submit update" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports",
        expect.objectContaining({ method: "POST" }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/report-1/submit",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(await screen.findByText("Published")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resubmit update" })).toBeTruthy();
  });

  it("autosaves submitted report edits through the update route", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/reports/report-1") {
        return Response.json({
          report: { ...submittedReport, summary: "Submitted edit" },
        });
      }

      return Response.json({ error: "Unexpected request." }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp(submittedReport);

    expect(screen.getByRole("button", { name: "Resubmit update" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: "Submitted edit" },
    });
    await advanceAutoSave();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports/report-1",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("resubmits an already published report", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        if (String(input) === "/api/reports/report-1/submit") {
          return Response.json({
            report: {
              ...submittedReport,
              submittedAt: "2026-05-20T14:30:00.000Z",
            },
          });
        }

        return Response.json({ error: "Unexpected request." }, { status: 500 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp(submittedReport);

    fireEvent.click(screen.getByRole("button", { name: "Resubmit update" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/report-1/submit",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input) === "/api/reports/report-1" && init?.method === "PUT",
      ),
    ).toBe(false);
    expect(await screen.findByText("Resubmitted for review.")).toBeTruthy();
    expect(screen.getByText("Published")).toBeTruthy();
  });

  it("deletes a draft without immediately recreating it", async () => {
    vi.useFakeTimers();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          String(input) === "/api/reports/report-1" &&
          init?.method === "DELETE"
        ) {
          return Response.json({ ok: true });
        }

        if (String(input) === "/api/reports") {
          return Response.json(
            { report: { ...savedDraft, summary: "Fresh draft" } },
            { status: 201 },
          );
        }

        return Response.json({ error: "Unexpected request." }, { status: 500 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp(savedDraft);

    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));

    await flushReact();
    expect(screen.getByText("Draft deleted.")).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => String(input) === "/api/reports",
      ),
    ).toHaveLength(0);

    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: "Fresh draft" },
    });
    await advanceAutoSave();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
