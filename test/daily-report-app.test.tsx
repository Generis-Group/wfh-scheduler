// @vitest-environment jsdom

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
        disabled,
        loadingLabel,
        onChange,
      }: {
        initialSummary: string;
        resetKey: string;
        disabled?: boolean;
        loadingLabel?: string;
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

      return ReactModule.createElement(
        ReactModule.Fragment,
        null,
        ReactModule.createElement("textarea", {
          "aria-label": "Summary",
          "aria-busy": disabled,
          disabled,
          value: snapshot.summary,
          onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            const next = {
              ...snapshotRef.current,
              summary: event.target.value,
            };
            snapshotRef.current = next;
            setSnapshot(next);
            onChangeRef.current(next);
          },
        }),
        disabled
          ? ReactModule.createElement(
              "div",
              { role: "status" },
              loadingLabel ?? "Loading...",
            )
          : null,
      );
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
import {
  emptyReportSubmitMessage,
  missingWorkLocationSubmitMessage,
} from "@/lib/report-submit-readiness";

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
  workLocation: "OFFICE" as const,
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
  props: Partial<
    Pick<DailyReportProps, "integrationStatus" | "weeklyPlannedLocations">
  > = {},
) {
  return render(
    <DailyReportApp
      initialReport={initialReport}
      date={date}
      integrationStatus={
        props.integrationStatus ?? { google: true, atlassian: false }
      }
      weeklyPlannedLocations={props.weeklyPlannedLocations}
    />,
  );
}

function chooseDailyWorkLocation(name: string) {
  fireEvent.click(
    screen.getByRole("combobox", {
      name: "Work location",
    }),
  );
  fireEvent.click(
    within(
      screen.getByRole("listbox", { name: "Work location options" }),
    ).getByRole("option", { name }),
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });

  return { promise, resolve };
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

describe("DailyReportApp drafts", () => {
  it("creates a draft only when Save draft is clicked", async () => {
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

    const saveButton = screen.getByRole("button", {
      name: "Save draft",
    }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: "Finished the rollout note" },
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(saveButton.disabled).toBe(false);
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Finished the rollout note"),
        }),
      );
    });
    await waitFor(() => {
      expect(saveButton.disabled).toBe(true);
    });
    expect(screen.queryByText("Draft saved.")).toBeNull();
  });

  it("imports tasks as part of a draft without an extra save request", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/sync/google-tasks")) {
        return Response.json({
          importedCount: 1,
          skippedCount: 0,
          staleCount: 0,
          activities: [importedTask],
          report: {
            ...savedDraft,
            activities: [importedTask],
          },
        });
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
    expect(
      fetchMock.mock.calls.some(([input]) => String(input) === "/api/reports"),
    ).toBe(false);
    expect(
      (screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Delete draft" })).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/api/activity"),
      ),
    ).toBe(false);
  });

  it("clears pending removals when imported work items are re-imported before save", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/api/sync/google-tasks")) {
          return Response.json({
            importedCount: 1,
            skippedCount: 0,
            staleCount: 0,
            activities: [importedTask],
            report: {
              ...savedDraft,
              activities: [importedTask],
            },
          });
        }

        return Response.json({ error: "Unexpected request." }, { status: 500 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp({
      ...savedDraft,
      activities: [importedTask],
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions for Imported task",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));

    await waitFor(() => {
      expect(screen.queryByText("Imported task")).toBeNull();
    });
    expect(
      (screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Import Google Tasks" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Imported task")).toBeTruthy();
    });
    await waitFor(() => {
      expect(
        (
          screen.getByRole("button", {
            name: "Save draft",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input) === "/api/reports/report-1" && init?.method === "PUT",
      ),
    ).toBe(false);
  });

  it("resets imported work items when the draft is deleted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/api/sync/google-tasks")) {
          return Response.json({
            importedCount: 1,
            skippedCount: 0,
            staleCount: 0,
            activities: [importedTask],
            report: {
              ...savedDraft,
              activities: [importedTask],
            },
          });
        }

        if (url === "/api/reports/report-1" && init?.method === "DELETE") {
          return Response.json({ ok: true });
        }

        return Response.json({ error: "Unexpected request." }, { status: 500 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Import Google Tasks" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Imported task")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));

    await waitFor(() => {
      expect(screen.queryByText("Imported task")).toBeNull();
    });
    expect(
      screen.getByText(
        "No activities yet. Add a work item or import from Jira, Calendar, Tasks, Gmail, or Chat.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete draft" })).toBeNull();
  });

  it("imports all connected providers from the import menu", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/sync/jira")) {
        return Response.json({
          importedCount: 1,
          skippedCount: 0,
          staleCount: 0,
          activities: [linkedJiraTask],
        });
      }

      if (
        url.includes("/api/sync/google-calendar") ||
        url.includes("/api/sync/google-tasks") ||
        url.includes("/api/sync/gmail") ||
        url.includes("/api/sync/google-chat")
      ) {
        return Response.json({
          importedCount: 0,
          skippedCount: 0,
          staleCount: 0,
          activities: [],
        });
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
    fireEvent.click(screen.getByRole("button", { name: "Import all" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sync/jira",
        expect.objectContaining({ method: "POST" }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sync/google-calendar",
        expect.objectContaining({ method: "POST" }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sync/google-tasks",
        expect.objectContaining({ method: "POST" }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sync/gmail",
        expect.objectContaining({ method: "POST" }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sync/google-chat",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(
      screen.getByText("Import complete: 1 work item found."),
    ).toBeTruthy();
    expect(screen.getByText(linkedJiraTask.title)).toBeTruthy();
    expect(
      screen.queryByText("No calendar work items found for this date."),
    ).toBeNull();
    expect(
      screen.queryByText("No tasks work items found for this date."),
    ).toBeNull();
  });

  it("shows one no-results message when import all finds nothing", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (
        url.includes("/api/sync/jira") ||
        url.includes("/api/sync/google-calendar") ||
        url.includes("/api/sync/google-tasks") ||
        url.includes("/api/sync/gmail") ||
        url.includes("/api/sync/google-chat")
      ) {
        return Response.json({
          importedCount: 0,
          skippedCount: 0,
          staleCount: 0,
          activities: [],
        });
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
    fireEvent.click(screen.getByRole("button", { name: "Import all" }));

    await waitFor(() => {
      expect(
        screen.getByText("No work items found for this date."),
      ).toBeTruthy();
    });
    expect(
      screen.queryByText("No jira work items found for this date."),
    ).toBeNull();
    expect(
      screen.queryByText("No calendar work items found for this date."),
    ).toBeNull();
    expect(
      screen.queryByText("No tasks work items found for this date."),
    ).toBeNull();
  });

  it("summarizes selected work items with AI into the summary editor", async () => {
    const aiSummary =
      "## Production Updates\n- Advanced the rollout plan [Draft rollout plan](https://generis.local/activity/task-manual?source=GOOGLE_TASKS).";
    const aiRequest = deferred<Response>();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/reports/report-1/summary/ai") {
        return aiRequest.promise;
      }

      return Response.json({ error: "Unexpected request." }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp({
      ...savedDraft,
      activities: [manualGoogleTask],
    });

    const summarizeButton = screen.getByRole("button", {
      name: "Summarize with AI",
    });

    expect(summarizeButton.getAttribute("title")).toBe("Summarize with AI");
    fireEvent.click(summarizeButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/report-1/summary/ai",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(
      (screen.getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toBe(
      "Summarizing with AI...",
    );

    aiRequest.resolve(Response.json({ summary: aiSummary }));

    await waitFor(() => {
      expect(
        (
          screen.getByRole("textbox", {
            name: "Summary",
          }) as HTMLTextAreaElement
        ).value,
      ).toBe(aiSummary);
    });
    expect(
      screen.getByText("AI summary added. Review and save when ready."),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("/submit")),
    ).toBe(false);
  });

  it("creates a draft before summarizing with AI when no report exists yet", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/reports") {
        return Response.json(
          {
            report: {
              ...savedDraft,
              activities: [manualGoogleTask],
            },
          },
          { status: 201 },
        );
      }

      if (url === "/api/reports/report-1/summary/ai") {
        return Response.json({ summary: "## Production Updates\n- Created." });
      }

      return Response.json({ error: "Unexpected request." }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp({
      ...emptyReport,
      activities: [manualGoogleTask],
    });

    fireEvent.click(screen.getByRole("button", { name: "Summarize with AI" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports",
        expect.objectContaining({ method: "POST" }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/report-1/summary/ai",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/reports");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "/api/reports/report-1/summary/ai",
    );
  });

  it("asks before replacing an existing summary with AI", () => {
    const confirmMock = vi.fn(() => false);
    const fetchMock = vi.fn();
    vi.stubGlobal("confirm", confirmMock);
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp({
      ...savedDraft,
      summary: "Existing summary",
      activities: [manualGoogleTask],
    });

    fireEvent.click(screen.getByRole("button", { name: "Summarize with AI" }));

    expect(confirmMock).toHaveBeenCalledWith(
      "Replace the current summary with an AI-generated summary?",
    );
    expect(fetchMock).not.toHaveBeenCalled();
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
      (screen.getByRole("button", { name: "Import all" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
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
          name: "Import Gmail with AI",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Import Google Chat with AI",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.queryByRole("button", {
        name: "Find unfinished Google Tasks",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Manage integrations" }),
    ).toBeNull();
  });

  it("imports Google Chat from the Google Chat menu item only", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/sync/google-chat")) {
        return Response.json({
          importedCount: 0,
          skippedCount: 0,
          staleCount: 0,
          activities: [],
        });
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
    fireEvent.click(
      screen.getByRole("button", { name: "Import Google Chat with AI" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sync/google-chat",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/sync/jira",
      expect.anything(),
    );
  });

  it("keeps import button text stable while progress appears in the work items section", async () => {
    const syncRequest = deferred<Response>();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/sync/google-chat")) {
        return syncRequest.promise;
      }

      return Response.json({ error: "Unexpected request." }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Import Google Chat with AI" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Starting Google Chat import...")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Import" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Importing Google Chat..." }),
    ).toBeNull();

    syncRequest.resolve(
      Response.json({
        importedCount: 0,
        skippedCount: 0,
        staleCount: 0,
        activities: [],
      }),
    );
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

  it("saves the latest edited summary when Save draft is clicked", async () => {
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
    fireEvent.change(summaryBox, { target: { value: "Second edit" } });
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ body: expect.stringContaining("Second edit") }),
    );
  });

  it("saves formatted summary markdown only through manual save", async () => {
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
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body));
    expect(body.summary).toBe(formattedSummary);
  });

  it("warns before unloading with unsaved draft progress", () => {
    renderDailyReportApp();

    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: "Needs saving" },
    });

    const event = new Event("beforeunload", { cancelable: true });

    expect(window.dispatchEvent(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not warn before unloading when the draft has not changed", () => {
    renderDailyReportApp(savedDraft);

    const event = new Event("beforeunload", { cancelable: true });

    expect(window.dispatchEvent(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });

  it("warns before following in-app links with unsaved draft progress", () => {
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(false);
    const link = document.createElement("a");
    link.href = "/settings";
    link.textContent = "Settings";
    document.body.appendChild(link);

    try {
      renderDailyReportApp();

      fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
        target: { value: "Needs saving" },
      });

      const event = new MouseEvent("click", {
        bubbles: true,
        button: 0,
        cancelable: true,
      });

      expect(link.dispatchEvent(event)).toBe(false);
      expect(event.defaultPrevented).toBe(true);
      expect(confirmMock).toHaveBeenCalledWith(
        "Discard unsaved changes and leave this update?",
      );
    } finally {
      link.remove();
    }
  });

  it("keeps newer edits local when they happen during an in-flight save", async () => {
    const firstSave = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/reports") {
        return firstSave.promise;
      }

      return Promise.resolve(
        Response.json({ error: "Unexpected request." }, { status: 500 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    const summaryBox = screen.getByRole("textbox", { name: "Summary" });
    fireEvent.change(summaryBox, { target: { value: "First edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports",
        expect.objectContaining({ method: "POST" }),
      );
    });
    fireEvent.change(summaryBox, { target: { value: "Second edit" } });

    firstSave.resolve(
      Response.json(
        { report: { ...savedDraft, summary: "First edit" } },
        { status: 201 },
      ),
    );
    await flushReact();

    expect(
      (screen.getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement)
        .value,
    ).toBe("Second edit");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("keeps unsaved draft edits on the current date when discard is canceled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
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
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.confirm).toHaveBeenCalledWith(
      "Discard unsaved changes and change dates?",
    );
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement)
        .value,
    ).toBe("Needs saving");
  });

  it("does not route when the selected date is picked again with unsaved edits", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn(async () =>
      Response.json({ error: "Nope" }, { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: "Needs saving" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Open report date picker" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Select May 20, 2026" }),
    );

    await flushReact();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockRouterRefresh).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement)
        .value,
    ).toBe("Needs saving");
  });

  it("navigates dates without saving after unsaved edits are discarded", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
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
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.confirm).toHaveBeenCalledWith(
      "Discard unsaved changes and change dates?",
    );
    expect(mockRouterPush).toHaveBeenCalledWith("/?date=2026-05-21");
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

    chooseDailyWorkLocation("Office AM / WFH PM");

    expect(locationPicker.textContent).toContain("Office AM / WFH PM");
  });

  it("shows today's weekly plan without exposing the full planner", () => {
    renderDailyReportApp(
      { ...emptyReport, workLocation: "OFFICE" as const },
      "2026-05-20",
      {
      weeklyPlannedLocations: [{ date: "2026-05-20", workLocation: "OFFICE" }],
      },
    );

    expect(
      screen.getByRole("combobox", { name: "Work location" }).textContent,
    ).toContain("Office");
    expect(screen.getByText(/Planned today:/)).toBeTruthy();
    expect(screen.queryByText("Weekly plan")).toBeNull();
  });

  it("confirms changing a daily location away from the weekly plan", async () => {
    renderDailyReportApp(
      {
        ...savedDraft,
        workLocation: "OFFICE" as const,
      },
      "2026-05-20",
      {
        weeklyPlannedLocations: [
          { date: "2026-05-20", workLocation: "OFFICE" },
        ],
      },
    );

    chooseDailyWorkLocation("WFH");

    expect(screen.getByText(/Your weekly plan says/i).textContent).toContain(
      "Office",
    );
    expect(screen.getByRole("button", { name: "Use WFH" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Use WFH" }));

    expect(
      screen.getByRole("combobox", { name: "Work location" }).textContent,
    ).toContain("WFH");
    expect(screen.getByText("Different from weekly plan")).toBeTruthy();
  });

  it("confirms a weekly plan mismatch when changing from unspecified", () => {
    renderDailyReportApp(emptyReport, "2026-05-20", {
      weeklyPlannedLocations: [{ date: "2026-05-20", workLocation: "OFFICE" }],
    });

    chooseDailyWorkLocation("WFH");

    expect(screen.getByText(/Your weekly plan says/i).textContent).toContain(
      "Office",
    );
    expect(screen.getByRole("button", { name: "Use WFH" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Use WFH" }));

    expect(
      screen.getByRole("combobox", { name: "Work location" }).textContent,
    ).toContain("WFH");
  });

  it("labels completed imported Google Tasks as done", () => {
    renderDailyReportApp({
      ...savedDraft,
      activities: [importedTask],
    });

    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.queryByText("Not set")).toBeNull();
  });

  it("hides non-actionable noted status on imported AI work items", () => {
    renderDailyReportApp({
      ...savedDraft,
      activities: [
        {
          ...importedTask,
          id: "chat-1",
          source: "GOOGLE_CHAT",
          title: "Coordinate launch review",
          status: "noted",
        },
      ],
    });

    expect(screen.getByText("Coordinate launch review")).toBeTruthy();
    expect(screen.queryByText("noted")).toBeNull();
    expect(screen.queryByText("Noted")).toBeNull();
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

  it("does not start a work item reference drag from row controls", () => {
    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
      setDragImage: vi.fn(),
    };

    renderDailyReportApp({
      ...savedDraft,
      activities: [manualGoogleTask],
    });

    fireEvent.dragStart(
      screen.getByRole("button", {
        name: "More actions for Draft rollout plan",
      }),
      {
        clientX: 80,
        clientY: 96,
        dataTransfer,
      },
    );

    expect(dataTransfer.setData).not.toHaveBeenCalled();
    expect(dataTransfer.setDragImage).not.toHaveBeenCalled();
    expect(document.querySelector(".activity-drag-preview")).toBeNull();
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

    const searchField = screen.getByRole("textbox", {
      name: "Search work items",
    }) as HTMLInputElement;
    fireEvent.change(searchField, {
      target: { value: "Draft rollout plan" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions for Draft rollout plan",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(screen.queryByRole("menu")).toBeNull();
    window.dispatchEvent(new Event("scroll"));
    const titleInput = screen.getByRole("textbox", {
      name: "Task title",
    }) as HTMLInputElement;
    expect(titleInput.value).toBe("Draft rollout plan");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    fireEvent.change(titleInput, {
      target: { value: "Renamed rollout plan" },
    });
    fireEvent.keyDown(titleInput, { key: "Enter" });

    expect(screen.getByText("Renamed rollout plan")).toBeTruthy();
    expect(searchField.value).toBe("Renamed rollout plan");

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/report-1",
        expect.objectContaining({ method: "PUT" }),
      );
    });

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

  it("adds manual work items and saves them with stable summary reference ids", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/reports/report-1") {
          const body = JSON.parse(String(init?.body)) as {
            manualActivities?: Array<{
              id: string;
              title: string;
              employeeNote: string | null;
              selected: boolean;
              status?: string | null;
              durationMinutes?: number | null;
            }>;
          };
          const manualActivity = body.manualActivities?.[0];

          return Response.json({
            report: {
              ...savedDraft,
              activities: manualActivity
                ? [
                    {
                      id: manualActivity.id,
                      source: "MANUAL",
                      title: manualActivity.title,
                      description: null,
                      status: manualActivity.status ?? "noted",
                      sourceUrl: null,
                      startedAt: null,
                      durationMinutes: manualActivity.durationMinutes ?? null,
                      selected: manualActivity.selected,
                      employeeNote: manualActivity.employeeNote,
                    },
                  ]
                : [],
            },
          });
        }

        return Response.json({ error: "Unexpected request." }, { status: 500 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp(savedDraft);

    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    const titleInput = screen.getByRole("textbox", {
      name: "Task title",
    }) as HTMLInputElement;
    expect(titleInput.value).toBe("New work item");
    fireEvent.change(titleInput, {
      target: { value: "Document client follow-up" },
    });
    fireEvent.keyDown(titleInput, { key: "Enter" });

    expect(screen.getByText("Document client follow-up")).toBeTruthy();
    expect(screen.getByText("Manual")).toBeTruthy();
    expect(screen.getByText("Noted")).toBeTruthy();

    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
      setDragImage: vi.fn(),
    };
    const workItem = screen.getByTitle(
      "Drag into the summary to reference this work item",
    );

    fireEvent.dragStart(workItem, {
      clientX: 80,
      clientY: 96,
      dataTransfer,
    });

    const referencePayload = JSON.parse(
      String(dataTransfer.setData.mock.calls[0]?.[1]),
    ) as { activityId: string; source: string; title: string };
    expect(referencePayload.activityId).toMatch(/^manual-/);
    expect(referencePayload.source).toBe("MANUAL");
    expect(referencePayload.title).toBe("Document client follow-up");
    fireEvent.dragEnd(workItem);

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/report-1",
        expect.objectContaining({ method: "PUT" }),
      );
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(requestBody.activityUpdates).toEqual([]);
    expect(requestBody.manualActivities).toEqual([
      expect.objectContaining({
        id: referencePayload.activityId,
        title: "Document client follow-up",
        employeeNote: null,
        selected: true,
        status: "noted",
        durationMinutes: null,
      }),
    ]);
  });

  it("does not resend a saved manual work item as new after an in-flight save", async () => {
    const firstSave = deferred<Response>();
    let manualActivityId = "";
    const manualActivityTitle = "Document client follow-up";
    const manualActivity = () => ({
      id: manualActivityId,
      source: "MANUAL" as const,
      title: manualActivityTitle,
      description: null,
      status: "noted",
      sourceUrl: null,
      startedAt: null,
      durationMinutes: null,
      selected: true,
      employeeNote: null,
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/reports/report-1" && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as {
          summary?: string;
          manualActivities?: Array<{ id: string }>;
        };
        const manualActivityInput = body.manualActivities?.[0];

        if (manualActivityInput) {
          manualActivityId = manualActivityInput.id;
          return firstSave.promise;
        }

        return Promise.resolve(
          Response.json({
            report: {
              ...savedDraft,
              summary: body.summary ?? "",
              activities: [manualActivity()],
            },
          }),
        );
      }

      return Promise.resolve(
        Response.json({ error: "Unexpected request." }, { status: 500 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp(savedDraft);

    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    const titleInput = screen.getByRole("textbox", {
      name: "Task title",
    }) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: manualActivityTitle } });
    fireEvent.keyDown(titleInput, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: "Edited while saving" },
    });
    firstSave.resolve(
      Response.json({
        report: {
          ...savedDraft,
          activities: [manualActivity()],
        },
      }),
    );
    await flushReact();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const secondRequestBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit).body),
    );
    expect(secondRequestBody.manualActivities).toEqual([]);
    expect(secondRequestBody.activityUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: manualActivityId,
          title: manualActivityTitle,
          selected: true,
        }),
      ]),
    );
  });

  it("keeps unchecked work items visible and excludes them from the draft", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          report: {
            ...savedDraft,
            activities: [{ ...manualGoogleTask, selected: false }],
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp({
      ...savedDraft,
      activities: [manualGoogleTask],
    });

    const checkbox = screen.getByRole("checkbox", {
      name: "Include Draft rollout plan",
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);

    expect(screen.getByText("Draft rollout plan")).toBeTruthy();
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Include Draft rollout plan",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/report-1",
        expect.objectContaining({ method: "PUT" }),
      );
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(requestBody.activityUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task-manual",
          selected: false,
        }),
      ]),
    );
  });

  it("removes work items and matching summary references from the report", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          report: {
            ...savedDraft,
            summary: "",
            activities: [],
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
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));

    expect(screen.queryByText("Draft rollout plan")).toBeNull();
    expect(
      (screen.getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement)
        .value,
    ).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/report-1",
        expect.objectContaining({ method: "PUT" }),
      );
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(requestBody.summary).toBe("");
    expect(requestBody.activityUpdates).toEqual([]);
    expect(requestBody.deletedActivityIds).toEqual(["task-manual"]);
  });

  it("clears all work items and matching summary references from the report", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          report: {
            ...savedDraft,
            summary: "",
            activities: [],
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp({
      ...savedDraft,
      summary:
        "[Draft rollout plan](https://generis.local/activity/task-manual?source=GOOGLE_TASKS)\n[IT-3027: Improve website loading speed and performance](https://generis.local/activity/jira-linked?source=JIRA)",
      activities: [manualGoogleTask, linkedJiraTask],
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear work items" }));

    expect(screen.queryByText("Draft rollout plan")).toBeNull();
    expect(screen.queryByText(linkedJiraTask.title)).toBeNull();
    expect(
      (screen.getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement)
        .value,
    ).toBe("");
    expect(screen.getByText("Work items cleared.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/report-1",
        expect.objectContaining({ method: "PUT" }),
      );
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(requestBody.activityUpdates).toEqual([]);
    expect(requestBody.manualActivities).toEqual([]);
    expect(requestBody.deletedActivityIds).toEqual(
      expect.arrayContaining(["task-manual", "jira-linked"]),
    );
    expect(requestBody.deletedActivityIds).toHaveLength(2);
  });

  it("keeps summary reference removals made before the lazy editor mounts", async () => {
    mockLazySummaryEditorMounted.current = false;
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          report: {
            ...savedDraft,
            summary: "",
            activities: [],
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
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/report-1",
        expect.objectContaining({ method: "PUT" }),
      );
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(requestBody.summary).toBe("");
    expect(requestBody.deletedActivityIds).toEqual(["task-manual"]);
  });

  it("blocks submitting without a work location", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    fireEvent.click(screen.getByRole("button", { name: "Submit update" }));

    expect(
      await screen.findByText(missingWorkLocationSubmitMessage),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks submitting an empty draft", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    chooseDailyWorkLocation("Office");
    fireEvent.click(screen.getByRole("button", { name: "Submit update" }));

    expect(await screen.findByText(emptyReportSubmitMessage)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a draft before submitting a new report", async () => {
    const submittedSummary = "Reviewed launch tasks.";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/reports") {
        return Response.json(
          { report: { ...savedDraft, summary: submittedSummary } },
          { status: 201 },
        );
      }

      if (url === "/api/reports/report-1/submit") {
        return Response.json({
          report: { ...submittedReport, summary: submittedSummary },
        });
      }

      return Response.json({ error: "Unexpected request." }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: submittedSummary },
    });
    chooseDailyWorkLocation("Office");
    fireEvent.click(screen.getByRole("button", { name: "Submit update" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(submittedSummary),
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/report-1/submit",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(await screen.findByText("Submitted for review.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Resubmit update" }),
    ).toBeTruthy();
  });

  it("allows submitting an out-of-office report without work items or summary", async () => {
    const outOfOfficeDraft = {
      ...savedDraft,
      workLocation: "OUT_OF_OFFICE" as const,
    };
    const outOfOfficeSubmittedReport = {
      ...submittedReport,
      workLocation: "OUT_OF_OFFICE" as const,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/reports") {
        return Response.json({ report: outOfOfficeDraft }, { status: 201 });
      }

      if (url === "/api/reports/report-1/submit") {
        return Response.json({ report: outOfOfficeSubmittedReport });
      }

      return Response.json({ error: "Unexpected request." }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp();

    chooseDailyWorkLocation("Out of office");
    fireEvent.click(screen.getByRole("button", { name: "Submit update" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"workLocation":"OUT_OF_OFFICE"'),
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/report-1/submit",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("does not offer PTO as a daily work location", () => {
    renderDailyReportApp();

    fireEvent.click(screen.getByRole("combobox", { name: "Work location" }));

    const locationOptions = screen.getByRole("listbox", {
      name: "Work location options",
    });
    expect(
      within(locationOptions).queryByRole("option", { name: "PTO" }),
    ).toBeNull();
    expect(
      within(locationOptions).getByRole("option", { name: "Out of office" }),
    ).toBeTruthy();
  });

  it("manually saves submitted report edits through the update route", async () => {
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
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/report-1",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.not.objectContaining({ "X-Generis-Autosave": "1" }),
      }),
    );
  });

  it("resubmits an already published report", async () => {
    const publishedReport = {
      ...submittedReport,
      summary: "Published daily note.",
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        if (String(input) === "/api/reports/report-1/submit") {
          return Response.json({
            report: {
              ...publishedReport,
              submittedAt: "2026-05-20T14:30:00.000Z",
            },
          });
        }

        return Response.json({ error: "Unexpected request." }, { status: 500 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDailyReportApp(publishedReport);

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
    expect(
      screen.getByRole("button", { name: "Resubmit update" }),
    ).toBeTruthy();
  });

  it("deletes a draft without immediately recreating it", async () => {
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
    expect(mockRouterRefresh).toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => String(input) === "/api/reports",
      ),
    ).toHaveLength(0);

    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: "Fresh draft" },
    });
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => String(input) === "/api/reports",
      ),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
