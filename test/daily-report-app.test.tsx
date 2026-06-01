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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRouterPush, mockRouterRefresh, mockLazySummaryEditorMounted } =
  vi.hoisted(() => ({
    mockRouterPush: vi.fn(),
    mockRouterRefresh: vi.fn(),
    mockLazySummaryEditorMounted: { current: true },
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
  type Snapshot = { summary: string };

  return {
    summaryActivityReferenceDragType:
      "application/x-generis-activity-reference",
    SummaryEditor: ReactModule.forwardRef(function MockSummaryEditor(
      {
        initialSummary,
        resetKey,
        onChange,
      }: {
        initialSummary: string;
        resetKey: string;
        onChange: (snapshot: Snapshot) => void;
      },
      ref,
    ) {
      const [snapshot, setSnapshot] = ReactModule.useState<Snapshot>({
        summary: initialSummary,
      });
      const snapshotRef = ReactModule.useRef(snapshot);
      const onChangeRef = ReactModule.useRef(onChange);

      ReactModule.useEffect(() => {
        onChangeRef.current = onChange;
      }, [onChange]);

      ReactModule.useEffect(() => {
        const next = { summary: initialSummary };
        snapshotRef.current = next;
        setSnapshot(next);
        onChangeRef.current(next);
      }, [initialSummary, resetKey]);

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

vi.mock("@/components/reports/lazy-summary-editor", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  const summaryEditor = await vi.importMock<
    typeof import("@/components/reports/summary-editor")
  >("@/components/reports/summary-editor");
  const SummaryEditor = summaryEditor.SummaryEditor;

  return {
    LazySummaryEditor: ReactModule.forwardRef(function MockLazySummaryEditor(
      props: React.ComponentProps<typeof SummaryEditor>,
      ref: React.Ref<React.ElementRef<typeof SummaryEditor>>,
    ) {
      if (!mockLazySummaryEditorMounted.current) {
        return ReactModule.createElement("div", {
          "aria-label": "Loading summary editor",
          role: "status",
        });
      }

      return ReactModule.createElement(SummaryEditor, {
        ...props,
        ref,
      } as React.ComponentProps<typeof SummaryEditor> & { ref: typeof ref });
    }),
  };
});

import { DailyReportApp } from "@/components/reports/daily-report-app";
import { todayDateString } from "@/lib/dates";

type DailyReportProps = React.ComponentProps<typeof DailyReportApp>;

const emptyReport: DailyReportProps["initialReport"] = {
  id: "",
  reportDate: "2026-05-20",
  workLocation: "UNKNOWN" as const,
  summary: "",
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

const manualGoogleTask: DailyReportProps["initialReport"]["activities"][number] =
  {
    id: "task-manual",
    source: "GOOGLE_TASKS" as const,
    title: "Draft rollout plan",
    description: null,
    status: "in progress",
    sourceUrl: "#",
    startedAt: "2026-05-20T12:00:00.000Z",
    durationMinutes: null,
    selected: true,
    employeeNote: null,
  };

const linkedJiraTask: DailyReportProps["initialReport"]["activities"][number] =
  {
    id: "jira-linked",
    source: "JIRA" as const,
    title: "IT-3027: Improve website loading speed and performance",
    description: null,
    status: "In Progress",
    sourceUrl: "https://generisgp.atlassian.net/browse/IT-3027",
    startedAt: "2026-05-20T13:00:00.000Z",
    durationMinutes: 60,
    selected: true,
    employeeNote: null,
  };

function renderDailyReportApp(
  initialReport: DailyReportProps["initialReport"] = emptyReport,
  date = "2026-05-20",
) {
  return render(
    <DailyReportApp
      initialReport={initialReport}
      date={date}
      integrationStatus={{ google: true, atlassian: false }}
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

beforeEach(() => {
  mockLazySummaryEditorMounted.current = true;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DailyReportApp auto-draft", () => {
  it("auto-creates a draft after editing summary", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        if (String(input) === "/api/reports") {
          return Response.json(
            { report: { ...savedDraft, summary: "Finished the rollout note" } },
            { status: 201 },
          );
        }

        return Response.json({ error: "Unexpected request." }, { status: 500 });
      },
    );
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
    fireEvent.click(
      screen.getByRole("button", { name: "Import Google Tasks" }),
    );

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

  it("shows unavailable imports as disabled actions before integrations are connected", () => {
    render(
      <DailyReportApp
        initialReport={emptyReport}
        date="2026-05-20"
        integrationStatus={{ google: false, atlassian: false }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(
      (screen.getByRole("button", { name: "Import Jira" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Import Google Calendar",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Import Google Tasks",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Find unfinished Google Tasks",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByRole("link", { name: "Manage integrations" }),
    ).toBeTruthy();
  });

  it("shows actionable streamed import errors", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/sync/jira")) {
        return new Response(
          'event: error\ndata: {"message":"Connect Atlassian before syncing."}\n\n',
          {
            headers: { "Content-Type": "text/event-stream" },
          },
        );
      }

      return Response.json({ error: "Unexpected request." }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DailyReportApp
        initialReport={emptyReport}
        date="2026-05-20"
        integrationStatus={{ google: true, atlassian: true }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.click(screen.getByRole("button", { name: "Import Jira" }));

    await waitFor(() => {
      expect(
        screen.getByText("Connect Atlassian before syncing."),
      ).toBeTruthy();
    });
  });

  it("adds an unfinished Google Task manually", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/api/google-tasks/search")) {
          return Response.json({
            tasks: [
              {
                taskId: "task-manual",
                taskListId: "list-1",
                taskListTitle: "Primary tasks",
                title: "Draft rollout plan",
                notes: null,
                status: "needsAction",
                due: null,
                updated: "2026-05-20T12:00:00.000Z",
                sourceUrl: "#",
              },
            ],
          });
        }

        if (url === "/api/reports/google-task") {
          expect(init).toEqual(
            expect.objectContaining({
              method: "POST",
              body: expect.stringContaining("task-manual"),
            }),
          );

          return Response.json({
            report: { ...savedDraft, activities: [manualGoogleTask] },
          });
        }

        return Response.json({ error: "Unexpected request." }, { status: 500 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp(savedDraft);

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Find unfinished Google Tasks" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Find unfinished Google Tasks" }),
      { target: { value: "rollout" } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushReact();

    const taskButton = screen.getByRole("button", {
      name: /Draft rollout plan/i,
    });
    fireEvent.click(taskButton);

    await flushReact();
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports/google-task",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(screen.getAllByText("Draft rollout plan")).toHaveLength(1);
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

  it("flushes formatted summary markdown before page refresh", async () => {
    vi.useFakeTimers();
    const formattedSummary = "## **_Header_**\n- **_Bullet_**\n1. _Numbered_";
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json(
          { report: { ...savedDraft, summary: formattedSummary } },
          { status: 201 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();
    await flushReact();

    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: formattedSummary },
    });
    window.dispatchEvent(new Event("pagehide"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
      }),
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body));
    expect(body.summary).toBe(formattedSummary);
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

  it("hides forward date controls on the latest report date", () => {
    const today = todayDateString();

    renderDailyReportApp(
      {
        ...savedDraft,
        reportDate: today,
      },
      today,
    );

    expect(screen.queryByRole("button", { name: "Next day" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Jump to today" })).toBeNull();
  });

  it("uses custom date and location pickers", async () => {
    renderDailyReportApp(savedDraft);

    fireEvent.click(
      screen.getByRole("button", { name: "Open report date picker" }),
    );

    expect(screen.getByText("May 2026")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Select May 19, 2026" }),
    );

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/?date=2026-05-19");
    });

    cleanup();
    renderDailyReportApp(savedDraft);

    const locationPicker = screen.getByRole("combobox", {
      name: "Work location",
    });

    fireEvent.click(locationPicker);
    fireEvent.click(screen.getByRole("option", { name: "Hybrid" }));

    expect(locationPicker.textContent).toContain("Hybrid");
  });

  it("labels completed imported Google Tasks as done", () => {
    renderDailyReportApp({
      ...savedDraft,
      activities: [importedTask],
    });

    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.queryByText("Not set")).toBeNull();
  });

  it("uses a custom drag preview for work item references", async () => {
    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
      setDragImage: vi.fn(),
    };

    renderDailyReportApp({
      ...savedDraft,
      activities: [manualGoogleTask],
    });

    const workItem = screen.getByTitle(
      "Drag into the summary to reference this work item",
    );
    fireEvent.dragStart(workItem, {
      clientX: 80,
      clientY: 96,
      dataTransfer,
    });

    expect(dataTransfer.setDragImage).toHaveBeenCalled();
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      "application/x-generis-activity-reference",
      expect.stringContaining("Draft rollout plan"),
    );
    expect(dataTransfer.setData).not.toHaveBeenCalledWith(
      "text/plain",
      expect.any(String),
    );

    const preview = document.querySelector<HTMLElement>(
      ".activity-drag-preview",
    );
    expect(preview?.textContent).toContain("Draft rollout plan");

    const dragOver = new Event("dragover");
    Object.defineProperties(dragOver, {
      clientX: { value: 112 },
      clientY: { value: 128 },
    });
    window.dispatchEvent(dragOver);

    await waitFor(() => {
      expect(preview?.style.left).toBe("112px");
      expect(preview?.style.top).toBe("128px");
    });

    fireEvent.dragEnd(workItem);

    await waitFor(() => {
      expect(document.querySelector(".activity-drag-preview")).toBeNull();
    });
  });

  it("prevents source links from showing the browser native drag preview", () => {
    renderDailyReportApp({
      ...savedDraft,
      activities: [linkedJiraTask],
    });

    expect(
      screen
        .getByRole("link", {
          name: "IT-3027: Improve website loading speed and performance",
        })
        .getAttribute("draggable"),
    ).toBe("false");
  });

  it("renames work items locally from the item menu", async () => {
    vi.useFakeTimers();
    const renamedTask = {
      ...manualGoogleTask,
      title: "Renamed rollout plan",
    };
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          report: { ...savedDraft, activities: [renamedTask] },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp({
      ...savedDraft,
      activities: [manualGoogleTask],
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions for Draft rollout plan",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Task title" }), {
      target: { value: "Renamed rollout plan" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Renamed rollout plan")).toBeTruthy();

    await advanceAutoSave();

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(requestBody.activityUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task-manual",
          title: "Renamed rollout plan",
        }),
      ]),
    );
  });

  it("removes work items and matching summary references from the report", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          report: {
            ...savedDraft,
            summary: "",
            activities: [{ ...manualGoogleTask, selected: false }],
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp({
      ...savedDraft,
      summary:
        "[Draft rollout plan](https://generis.local/activity/task-manual?source=GOOGLE_TASKS)",
      activities: [manualGoogleTask],
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions for Draft rollout plan",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.queryByText("Draft rollout plan")).toBeNull();
    expect(
      (screen.getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement)
        .value,
    ).toBe("");

    await advanceAutoSave();

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(requestBody.summary).toBe("");
    expect(requestBody.activityUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task-manual",
          selected: false,
        }),
      ]),
    );
  });

  it("keeps summary reference removals made before the lazy editor mounts", async () => {
    vi.useFakeTimers();
    mockLazySummaryEditorMounted.current = false;
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          report: {
            ...savedDraft,
            summary: "",
            activities: [{ ...manualGoogleTask, selected: false }],
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const initialReport = {
      ...savedDraft,
      summary:
        "[Draft rollout plan](https://generis.local/activity/task-manual?source=GOOGLE_TASKS)",
      activities: [manualGoogleTask],
    };

    const view = renderDailyReportApp(initialReport);

    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions for Draft rollout plan",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.queryByRole("textbox", { name: "Summary" })).toBeNull();

    mockLazySummaryEditorMounted.current = true;
    view.rerender(
      <DailyReportApp
        initialReport={initialReport}
        date="2026-05-20"
        integrationStatus={{ google: true, atlassian: false }}
      />,
    );

    expect(
      (screen.getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement)
        .value,
    ).toBe("");

    await advanceAutoSave();

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(requestBody.summary).toBe("");
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
    expect(
      screen.getByRole("button", { name: "Resubmit update" }),
    ).toBeTruthy();
  });

  it("autosaves submitted report edits through the update route", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        if (String(input) === "/api/reports/report-1") {
          return Response.json({
            report: { ...submittedReport, summary: "Submitted edit" },
          });
        }

        return Response.json({ error: "Unexpected request." }, { status: 500 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp(submittedReport);

    expect(
      screen.getByRole("button", { name: "Resubmit update" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: "Submitted edit" },
    });
    await advanceAutoSave();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports/report-1",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Generis-Autosave": "1" }),
      }),
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
    const deleteRequest = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (
        String(input) === "/api/reports/report-1" &&
        init?.method === "DELETE"
      ) {
        return deleteRequest.promise;
      }

      if (String(input) === "/api/reports") {
        return Promise.resolve(
          Response.json(
            { report: { ...savedDraft, summary: "Fresh draft" } },
            { status: 201 },
          ),
        );
      }

      return Promise.resolve(
        Response.json({ error: "Unexpected request." }, { status: 500 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp(savedDraft);

    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));

    expect(screen.getByRole("button", { name: "Deleting..." })).toBeTruthy();
    deleteRequest.resolve(Response.json({ ok: true }));
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
