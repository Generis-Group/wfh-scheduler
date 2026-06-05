"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DragEvent, MouseEvent } from "react";
import { flushSync } from "react-dom";
import {
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FixedToast } from "@/components/ui/fixed-toast";
import { Input } from "@/components/ui/input";
import { useDismissableLayer } from "@/components/ui/use-dismissable-layer";
import {
  EmptyReferenceState,
  ReferenceBadge,
} from "@/components/reports/reference-shell";
import {
  ReportDateSwitcher,
  type ReportDateControl,
} from "@/components/reports/report-date-switcher";
import {
  formatReportDuration,
  reportActivitySourceLabel,
  ReportActivitySourceIcon,
  ReportPageHeader,
  ReportSearchField,
  ReportSurface,
} from "@/components/reports/report-ui";
import { LazySummaryEditor } from "@/components/reports/lazy-summary-editor";
import type {
  SummaryEditorHandle,
  SummarySnapshot,
} from "@/components/reports/summary-editor";
import { dateOnlyString } from "@/lib/date-only";
import {
  readServerSentEvents,
  responseErrorMessage,
} from "@/lib/client-requests";
import {
  markServerDataStale,
  refreshStaleServerData,
} from "@/lib/client-cache-invalidation";
import { clampReportDateToToday, todayDateString } from "@/lib/dates";
import {
  removeSummaryActivityReferences,
  summaryActivityReferenceHref,
} from "@/lib/summary-format";
import {
  summaryActivityReferenceDragType,
  type SummaryActivityReferenceDragPayload,
} from "@/lib/summary-drag";
import { startClientTiming } from "@/lib/performance";
import {
  emptyReportSubmitMessage,
  hasSubmitReadyContent,
} from "@/lib/report-submit-readiness";
import type { SyncProgressEvent } from "@/lib/services/sync";
import { cn } from "@/lib/utils";

type ActivitySource = "JIRA" | "GOOGLE_CALENDAR" | "GOOGLE_TASKS" | "MANUAL";

type Activity = {
  id: string;
  source: ActivitySource;
  title: string;
  description?: string | null;
  status?: string | null;
  sourceUrl?: string | null;
  startedAt?: string | Date | null;
  durationMinutes?: number | null;
  selected: boolean;
  employeeNote?: string | null;
};

type Report = {
  id: string;
  reportDate: string | Date;
  workLocation:
    | "OFFICE"
    | "WFH"
    | "HYBRID"
    | "PTO"
    | "OUT_OF_OFFICE"
    | "UNKNOWN";
  summary: string;
  status: "DRAFT" | "SUBMITTED";
  submittedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  activities: Activity[];
  revisions?: Array<{ id: string; createdAt: string | Date }>;
};

type WorkLocation = Report["workLocation"];

type IntegrationStatus = {
  google: boolean;
  atlassian: boolean;
};

const syncProviderLabels = {
  jira: "Jira",
  "google-calendar": "Calendar",
  "google-tasks": "Tasks",
} as const;

const workLocationOptions: Array<{ value: WorkLocation; label: string }> = [
  { value: "UNKNOWN", label: "Unspecified" },
  { value: "OFFICE", label: "Office" },
  { value: "WFH", label: "WFH" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "PTO", label: "PTO" },
  { value: "OUT_OF_OFFICE", label: "Out of office" },
];

const interactiveActivityControlSelector =
  "a, button, input, textarea, select, [role='button'], [role='textbox'], [contenteditable='true']";
type BusyAction = "save" | "submit" | "delete";
type SyncProviderKey = keyof typeof syncProviderLabels;
const syncProviderSources: Record<SyncProviderKey, ActivitySource> = {
  jira: "JIRA",
  "google-calendar": "GOOGLE_CALENDAR",
  "google-tasks": "GOOGLE_TASKS",
};

type ReportPayload = {
  summary: string;
  workLocation: WorkLocation;
  activityUpdates: Array<{
    id: string;
    title: string;
    selected: boolean;
    employeeNote: string | null;
  }>;
  deletedActivityIds: string[];
  manualActivities: Array<{
    title: string;
    employeeNote: string | null;
    status?: string | null;
    durationMinutes?: number | null;
  }>;
};

type AutoDraftSnapshot = {
  reportId: string;
  reportDate: string;
  payload: ReportPayload;
  signature: string;
  hasMeaningfulContent: boolean;
};

type GoogleTaskSuggestion = {
  taskId: string;
  taskListId: string;
  taskListTitle: string;
  title: string;
  notes: string | null;
  status: string | null;
  due: string | null;
  updated: string | null;
  sourceUrl: string | null;
};
type GoogleTaskSearchStatus = "idle" | "loading" | "error";
type ActivityDragPreview = {
  id: string;
  source: ActivitySource;
  title: string;
  x: number;
  y: number;
};
type ImportProgress = {
  provider: SyncProviderKey;
  message: string;
  stage?: SyncProgressEvent["stage"];
};
type SyncResponseBody = {
  importedCount: number;
  skippedCount: number;
  staleCount?: number;
  activities?: Activity[];
};

function isInteractiveActivityControl(target: EventTarget | null) {
  return target instanceof Element
    ? Boolean(target.closest(interactiveActivityControlSelector))
    : false;
}

function activitySearchText(activity: Activity, title = activity.title) {
  return [
    title,
    activity.description,
    activity.status,
    reportActivitySourceLabel(activity.source),
    formatReportDuration(activity.durationMinutes),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function toDate(value?: string | Date | null) {
  if (!value) {
    return null;
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`);
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function activityStartedSortValue(activity: Activity) {
  return toDate(activity.startedAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function sortActivitiesForDisplay(items: Activity[]) {
  return [...items].sort((first, second) => {
    const startedDelta =
      activityStartedSortValue(first) - activityStartedSortValue(second);

    if (startedDelta !== 0) {
      return startedDelta;
    }

    return (
      first.title.localeCompare(second.title) ||
      first.id.localeCompare(second.id)
    );
  });
}

function mergeSyncedActivities(
  current: Activity[],
  source: ActivitySource,
  synced: Activity[],
) {
  return sortActivitiesForDisplay([
    ...current.filter((activity) => activity.source !== source),
    ...synced,
  ]);
}

function mergeActivitiesById(current: Activity[], next: Activity[]) {
  const nextIds = new Set(next.map((activity) => activity.id));

  return sortActivitiesForDisplay([
    ...current.filter((activity) => !nextIds.has(activity.id)),
    ...next,
  ]);
}

function dateInputValue(value: string | Date) {
  return dateOnlyString(value);
}

function workLocationLabel(value: WorkLocation) {
  return (
    workLocationOptions.find((option) => option.value === value)?.label ??
    "Unspecified"
  );
}

function statusTone(
  status?: string | null,
): "green" | "orange" | "blue" | "neutral" {
  const normalized = status?.toLowerCase() ?? "";

  if (
    normalized.includes("done") ||
    normalized.includes("complete") ||
    normalized.includes("submitted")
  ) {
    return "green";
  }

  if (normalized.includes("progress")) {
    return "blue";
  }

  if (
    normalized.includes("late") ||
    normalized.includes("todo") ||
    normalized.includes("draft")
  ) {
    return "orange";
  }

  return "neutral";
}

function activityStatusLabel(activity: Activity) {
  if (
    activity.source === "GOOGLE_TASKS" &&
    activity.status?.toLowerCase() === "completed"
  ) {
    return "Done";
  }

  return activity.status || "Not set";
}

function setTransparentDragImage(dataTransfer: DataTransfer) {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  dataTransfer.setDragImage(canvas, 0, 0);
}

function editorSummaryForReport(report: Report) {
  return report.summary;
}

function isNewManualActivity(activity: Activity) {
  return activity.id.startsWith("manual-new-");
}

function buildReportPayload(
  summary: string,
  workLocation: WorkLocation,
  activities: Activity[],
  deletedActivityIds: string[],
): ReportPayload {
  return {
    summary,
    workLocation,
    activityUpdates: activities
      .filter((activity) => !isNewManualActivity(activity))
      .map((activity) => ({
        id: activity.id,
        title: activity.title || "Untitled activity",
        selected: activity.selected,
        employeeNote: activity.employeeNote ?? null,
      })),
    deletedActivityIds,
    manualActivities: activities
      .filter(isNewManualActivity)
      .map((activity) => ({
        title: activity.title,
        employeeNote: activity.employeeNote ?? null,
        status: activity.status,
        durationMinutes: activity.durationMinutes ?? null,
      })),
  };
}

function draftPayloadSignature(reportDate: string, payload: ReportPayload) {
  return JSON.stringify({ reportDate, ...payload });
}

function hasMeaningfulDraftPayload(payload: ReportPayload) {
  return Boolean(
    payload.summary.trim() ||
    payload.workLocation !== "UNKNOWN" ||
    payload.activityUpdates.length > 0 ||
    payload.deletedActivityIds.length > 0 ||
    payload.manualActivities.length > 0,
  );
}

function hasSubmittableReportPayload(payload: ReportPayload) {
  return hasSubmitReadyContent({
    summary: payload.summary,
    workLocation: payload.workLocation,
    activities: payload.activityUpdates,
    manualActivities: payload.manualActivities,
  });
}

export function DailyReportApp({
  initialReport,
  date,
  integrationStatus = { google: false, atlassian: false },
}: {
  initialReport: Report;
  date: string;
  integrationStatus?: IntegrationStatus;
}) {
  const router = useRouter();
  const reportDate = dateInputValue(date);
  const initialSummary = editorSummaryForReport(initialReport);
  const initialPayload = buildReportPayload(
    initialSummary,
    initialReport.workLocation,
    initialReport.activities,
    [],
  );
  const [report, setReport] = useState(initialReport);
  const [summary, setSummary] = useState(() => initialSummary);
  const [summaryEditorSeed, setSummaryEditorSeed] = useState(
    () => initialSummary,
  );
  const [workLocation, setWorkLocation] = useState<WorkLocation>(
    initialReport.workLocation,
  );
  const [activities, setActivities] = useState(initialReport.activities);
  const [deletedActivityIds, setDeletedActivityIds] = useState<string[]>([]);
  const [openActivityMenu, setOpenActivityMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [renamingActivity, setRenamingActivity] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [importingProvider, setImportingProvider] =
    useState<SyncProviderKey | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(
    null,
  );
  const [pendingDateControl, setPendingDateControl] =
    useState<ReportDateControl | null>(null);
  const [activitySearch, setActivitySearch] = useState("");
  const [googleTaskFinderOpen, setGoogleTaskFinderOpen] = useState(false);
  const [googleTaskQuery, setGoogleTaskQuery] = useState("");
  const [googleTaskResults, setGoogleTaskResults] = useState<
    GoogleTaskSuggestion[]
  >([]);
  const [googleTaskSearchStatus, setGoogleTaskSearchStatus] =
    useState<GoogleTaskSearchStatus>("idle");
  const [addingGoogleTaskKey, setAddingGoogleTaskKey] = useState<string | null>(
    null,
  );
  const [activityDragPreview, setActivityDragPreview] =
    useState<ActivityDragPreview | null>(null);
  const summaryEditorRef = useRef<SummaryEditorHandle | null>(null);
  const pendingSummarySnapshotRef = useRef<SummarySnapshot | null>(null);
  const locationMenuRef = useRef<HTMLDivElement | null>(null);
  const importMenuRef = useRef<HTMLDivElement | null>(null);
  const activityMenuRef = useRef<HTMLDivElement | null>(null);
  const activityMenuOpenedAtRef = useRef(0);
  const googleTaskSearchAbortRef = useRef<AbortController | null>(null);
  const reportRef = useRef(initialReport);
  const latestDraftRef = useRef<AutoDraftSnapshot | null>(null);
  const lastSavedSignatureRef = useRef(
    draftPayloadSignature(reportDate, initialPayload),
  );
  const activityDragPreviewId = activityDragPreview?.id ?? null;

  useDismissableLayer({
    open: importMenuOpen,
    refs: [importMenuRef],
    onDismiss: () => setImportMenuOpen(false),
  });

  useDismissableLayer({
    open: locationMenuOpen,
    refs: [locationMenuRef],
    onDismiss: () => setLocationMenuOpen(false),
  });

  useDismissableLayer({
    open: Boolean(openActivityMenu),
    refs: [activityMenuRef],
    onDismiss: () => {
      setRenamingActivity(null);
      setOpenActivityMenu(null);
    },
  });

  useEffect(() => {
    const nextSummary = editorSummaryForReport(initialReport);
    const nextPayload = buildReportPayload(
      nextSummary,
      initialReport.workLocation,
      initialReport.activities,
      [],
    );

    reportRef.current = initialReport;
    lastSavedSignatureRef.current = draftPayloadSignature(
      reportDate,
      nextPayload,
    );
    latestDraftRef.current = {
      reportId: initialReport.id,
      reportDate,
      payload: nextPayload,
      signature: lastSavedSignatureRef.current,
      hasMeaningfulContent: hasMeaningfulDraftPayload(nextPayload),
    };

    setReport(initialReport);
    setSummary(nextSummary);
    setSummaryEditorSeed(nextSummary);
    setWorkLocation(initialReport.workLocation);
    setActivities(initialReport.activities);
    setDeletedActivityIds([]);
    setOpenActivityMenu(null);
    setRenamingActivity(null);
    setImportMenuOpen(false);
    setLocationMenuOpen(false);
    setMessage(null);
    setImportProgress(null);
    setActivitySearch("");
    setActivityDragPreview(null);
    setGoogleTaskFinderOpen(false);
    setGoogleTaskQuery("");
    setGoogleTaskResults([]);
    setGoogleTaskSearchStatus("idle");
    setAddingGoogleTaskKey(null);
    googleTaskSearchAbortRef.current?.abort();
    googleTaskSearchAbortRef.current = null;
    setPendingDateControl(null);
    pendingSummarySnapshotRef.current = null;
  }, [initialReport, date, reportDate]);

  useEffect(() => {
    if (!pendingDateControl) {
      return;
    }

    const fallbackTimer = window.setTimeout(() => {
      setPendingDateControl(null);
    }, 15000);

    return () => {
      window.clearTimeout(fallbackTimer);
    };
  }, [pendingDateControl]);

  useEffect(() => {
    if (!activityDragPreviewId) {
      return;
    }

    document.body.classList.add("reference-activity-dragging");

    function updatePreviewPosition(event: globalThis.DragEvent) {
      if (event.clientX === 0 && event.clientY === 0) {
        return;
      }

      setActivityDragPreview((current) =>
        current
          ? {
              ...current,
              x: event.clientX,
              y: event.clientY,
            }
          : current,
      );
    }

    function clearPreview() {
      setActivityDragPreview(null);
    }

    window.addEventListener("dragover", updatePreviewPosition);
    window.addEventListener("drop", clearPreview);
    window.addEventListener("dragend", clearPreview);

    return () => {
      document.body.classList.remove("reference-activity-dragging");
      window.removeEventListener("dragover", updatePreviewPosition);
      window.removeEventListener("drop", clearPreview);
      window.removeEventListener("dragend", clearPreview);
    };
  }, [activityDragPreviewId]);

  useEffect(() => {
    googleTaskSearchAbortRef.current?.abort();

    if (!googleTaskFinderOpen) {
      setGoogleTaskResults([]);
      setGoogleTaskSearchStatus("idle");
      return;
    }

    const query = googleTaskQuery.trim();

    if (query.length < 2) {
      setGoogleTaskResults([]);
      setGoogleTaskSearchStatus("idle");
      return;
    }

    const controller = new AbortController();
    googleTaskSearchAbortRef.current = controller;
    const timer = window.setTimeout(async () => {
      setGoogleTaskSearchStatus("loading");

      try {
        const response = await fetch(
          `/api/google-tasks/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(
            await responseErrorMessage(response, "Unable to search tasks."),
          );
        }

        const body = (await response.json()) as {
          tasks?: GoogleTaskSuggestion[];
        };
        setGoogleTaskResults(body.tasks ?? []);
        setGoogleTaskSearchStatus("idle");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setGoogleTaskSearchStatus("error");
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [googleTaskFinderOpen, googleTaskQuery]);

  function setActivity(id: string, patch: Partial<Activity>) {
    setActivities((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  const setSummaryEditorSnapshot = useCallback((snapshot: SummarySnapshot) => {
    if (summaryEditorRef.current) {
      summaryEditorRef.current.setSnapshot(snapshot);
      return;
    }

    pendingSummarySnapshotRef.current = snapshot;
    setSummaryEditorSeed(snapshot.summary);
  }, []);

  const setSummaryEditorHandle = useCallback(
    (handle: SummaryEditorHandle | null) => {
      summaryEditorRef.current = handle;

      if (!handle || !pendingSummarySnapshotRef.current) {
        return;
      }

      const pendingSnapshot = pendingSummarySnapshotRef.current;
      pendingSummarySnapshotRef.current = null;
      handle.setSnapshot(pendingSnapshot);
    },
    [],
  );

  function removeSummaryReferencesForActivity(activityId: string) {
    const snapshot = summaryEditorRef.current?.getSnapshot() ??
      pendingSummarySnapshotRef.current ?? { summary };
    const nextSummary = removeSummaryActivityReferences(
      snapshot.summary,
      activityId,
    );

    if (nextSummary === snapshot.summary) {
      return;
    }

    const nextSnapshot = { summary: nextSummary };
    setSummaryEditorSnapshot(nextSnapshot);
    handleSummaryChange(nextSnapshot);
  }

  const canSaveDraftSnapshot = useCallback((snapshot: AutoDraftSnapshot) => {
    if (snapshot.signature === lastSavedSignatureRef.current) {
      return false;
    }

    return Boolean(
      snapshot.reportId ||
      reportRef.current.id ||
      snapshot.hasMeaningfulContent,
    );
  }, []);

  const draftSnapshotFor = useCallback(
    (summaryValue: string): AutoDraftSnapshot => {
      const payload = buildReportPayload(
        summaryValue,
        workLocation,
        activities,
        deletedActivityIds,
      );
      const signature = draftPayloadSignature(reportDate, payload);

      return {
        reportId: reportRef.current.id,
        reportDate,
        payload,
        signature,
        hasMeaningfulContent: hasMeaningfulDraftPayload(payload),
      };
    },
    [activities, deletedActivityIds, reportDate, workLocation],
  );

  const handleSummaryChange = useCallback(
    (snapshot: SummarySnapshot) => {
      const nextSnapshot = draftSnapshotFor(snapshot.summary);

      latestDraftRef.current = nextSnapshot;

      startTransition(() => {
        setSummary((current) =>
          current === snapshot.summary ? current : snapshot.summary,
        );
      });
    },
    [draftSnapshotFor],
  );

  function removeActivity(activity: Activity) {
    removeSummaryReferencesForActivity(activity.id);

    if (activity.source !== "MANUAL") {
      setActivity(activity.id, { selected: false });
      setOpenActivityMenu(null);
      setRenamingActivity(null);
      return;
    }

    setActivities((items) => items.filter((item) => item.id !== activity.id));
    if (!isNewManualActivity(activity)) {
      setDeletedActivityIds((current) => [
        ...new Set([...current, activity.id]),
      ]);
    }
    setOpenActivityMenu(null);
    setRenamingActivity(null);
  }

  function startRenamingActivity(activity: Activity) {
    setRenamingActivity({
      id: activity.id,
      title: activity.title || "Untitled activity",
    });
    setOpenActivityMenu(null);
  }

  function saveActivityTitle(activity: Activity, titleOverride?: string) {
    const nextTitle = (titleOverride ?? renamingActivity?.title ?? "").trim();

    if (!nextTitle) {
      setRenamingActivity(null);
      return;
    }

    if (nextTitle === activity.title) {
      setRenamingActivity(null);
      return;
    }

    setActivity(activity.id, { title: nextTitle });
    const normalizedSearch = activitySearch.trim().toLowerCase();
    if (
      normalizedSearch &&
      !activitySearchText(activity, nextTitle).includes(normalizedSearch)
    ) {
      setActivitySearch(nextTitle);
    }
    setRenamingActivity(null);
    setOpenActivityMenu(null);
    setMessage("Task renamed locally.");
  }

  function updateRenamingActivityTitle(activityId: string, title: string) {
    setRenamingActivity((current) =>
      current && current.id === activityId ? { ...current, title } : current,
    );
  }

  function cancelRenamingActivity(activityId: string) {
    setRenamingActivity((current) =>
      current?.id === activityId ? null : current,
    );
  }

  function toggleActivityMenu(
    activityId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    if (openActivityMenu?.id === activityId) {
      setOpenActivityMenu(null);
      setRenamingActivity(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 240;
    const menuHeight = 160;
    const gap = 8;
    const top = Math.min(
      window.innerHeight - menuHeight - 12,
      Math.max(12, rect.bottom + gap),
    );
    const left = Math.min(
      window.innerWidth - menuWidth - 12,
      Math.max(12, rect.right - menuWidth),
    );

    setImportMenuOpen(false);
    activityMenuOpenedAtRef.current = Date.now();
    setOpenActivityMenu({ id: activityId, top, left });
    setRenamingActivity(null);
  }

  useEffect(() => {
    if (!openActivityMenu) {
      return;
    }

    function closeMenu(event: Event) {
      if (
        event.type === "scroll" &&
        (renamingActivity || Date.now() - activityMenuOpenedAtRef.current < 250)
      ) {
        return;
      }

      setRenamingActivity(null);
      setOpenActivityMenu(null);
    }

    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [openActivityMenu, renamingActivity]);

  const captureCurrentDraftSnapshot = useCallback(
    ({ syncState = true }: { syncState?: boolean } = {}) => {
      const editorSnapshot =
        summaryEditorRef.current?.getSnapshot() ??
        pendingSummarySnapshotRef.current;
      const currentSummary = editorSnapshot?.summary ?? summary;
      const snapshot = draftSnapshotFor(currentSummary);

      if (syncState && editorSnapshot && currentSummary !== summary) {
        setSummary(currentSummary);
      }

      latestDraftRef.current = snapshot;
      return snapshot;
    },
    [draftSnapshotFor, summary],
  );

  function applySavedReport(
    nextReport: Report,
    replaceLocalState: boolean,
    savedSignature: string,
  ) {
    if (!replaceLocalState) {
      const current = reportRef.current;
      const nextCurrent = {
        ...current,
        id: nextReport.id,
        reportDate: nextReport.reportDate,
        status: nextReport.status,
        submittedAt: nextReport.submittedAt,
        updatedAt: nextReport.updatedAt,
        revisions: nextReport.revisions ?? current.revisions,
      };

      reportRef.current = nextCurrent;
      setReport(nextCurrent);
      lastSavedSignatureRef.current = savedSignature;

      if (latestDraftRef.current) {
        latestDraftRef.current = {
          ...latestDraftRef.current,
          reportId: nextReport.id,
        };
      }

      return;
    }

    const nextSummary = editorSummaryForReport(nextReport);
    const nextPayload = buildReportPayload(
      nextSummary,
      nextReport.workLocation,
      nextReport.activities,
      [],
    );
    const nextReportDate = dateInputValue(nextReport.reportDate);
    const nextSignature = draftPayloadSignature(nextReportDate, nextPayload);

    reportRef.current = nextReport;
    lastSavedSignatureRef.current = nextSignature;
    latestDraftRef.current = {
      reportId: nextReport.id,
      reportDate: nextReportDate,
      payload: nextPayload,
      signature: nextSignature,
      hasMeaningfulContent: hasMeaningfulDraftPayload(nextPayload),
    };

    setReport(nextReport);
    setSummary(nextSummary);
    setActivities(nextReport.activities);
    setDeletedActivityIds([]);
    setWorkLocation(nextReport.workLocation);
    setSummaryEditorSnapshot({ summary: nextSummary });
  }

  const draftSaveRequest = useCallback(
    (
      snapshot: AutoDraftSnapshot,
    ): {
      url: string;
      init: RequestInit;
    } => {
      const reportId = snapshot.reportId || reportRef.current.id;

      return {
        url: reportId ? `/api/reports/${reportId}` : "/api/reports",
        init: {
          method: reportId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            reportId
              ? snapshot.payload
              : { ...snapshot.payload, date: snapshot.reportDate },
          ),
        },
      };
    },
    [],
  );

  async function saveDraftSnapshot(
    snapshot: AutoDraftSnapshot,
    {
      forceCreate = false,
      timingName = "daily:save-draft",
    }: { forceCreate?: boolean; timingName?: string } = {},
  ) {
    if (!forceCreate && !canSaveDraftSnapshot(snapshot)) {
      return reportRef.current.id ? reportRef.current : null;
    }

    const savedSignature = snapshot.signature;
    const requestDetails = draftSaveRequest(snapshot);
    const finishTiming = startClientTiming(timingName, {
      hasReport: Boolean(snapshot.reportId),
    });

    try {
      const response = await fetch(requestDetails.url, requestDetails.init);

      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Unable to save report."),
        );
      }

      const data = await response.json();
      const nextReport = data.report as Report;
      const replaceLocalState = latestDraftRef.current?.signature === savedSignature;

      applySavedReport(nextReport, replaceLocalState, savedSignature);
      markServerDataStale();
      finishTiming({ status: "success" });

      return nextReport;
    } catch {
      finishTiming({ status: "error" });
      return null;
    }
  }

  async function saveDraft() {
    if (busyAction || importingProvider || addingGoogleTaskKey) {
      return;
    }

    const snapshot = captureCurrentDraftSnapshot();

    if (!canSaveDraftSnapshot(snapshot)) {
      return;
    }

    flushSync(() => {
      setBusyAction("save");
      setMessage(null);
    });

    try {
      const saved = await saveDraftSnapshot(snapshot);

      if (!saved?.id) {
        setMessage("Save failed. Try again before leaving this update.");
        return;
      }
    } catch {
      setMessage("Unable to save draft. Check your connection and try again.");
    } finally {
      setBusyAction(null);
    }
  }

  async function submitReport() {
    if (busyAction || importingProvider) {
      return;
    }

    const snapshot = captureCurrentDraftSnapshot();

    if (!hasSubmittableReportPayload(snapshot.payload)) {
      setMessage(emptyReportSubmitMessage);
      return;
    }

    const finishTiming = startClientTiming("daily:submit", {
      status: reportRef.current.status,
    });
    const wasPublished = reportRef.current.status === "SUBMITTED";
    flushSync(() => {
      setBusyAction("submit");
      setMessage(null);
    });

    try {
      const saved = await saveDraftSnapshot(snapshot, {
        forceCreate: !reportRef.current.id,
        timingName: "daily:submit-save",
      });

      if (!saved?.id) {
        setMessage("Save failed. Try again before submitting.");
        finishTiming({ status: "save-failed" });
        return;
      }

      const submitResponse = await fetch(`/api/reports/${saved.id}/submit`, {
        method: "POST",
      });

      if (!submitResponse.ok) {
        setMessage(
          (await submitResponse.json()).error ?? "Unable to submit report.",
        );
        finishTiming({ status: "submit-failed" });
        return;
      }

      const nextReport = (await submitResponse.json()).report as Report;
      const submittedSummary =
        summaryEditorRef.current?.getSnapshot().summary ??
        pendingSummarySnapshotRef.current?.summary ??
        summary;
      applySavedReport(
        nextReport,
        true,
        draftPayloadSignature(
          reportDate,
          buildReportPayload(
            submittedSummary,
            workLocation,
            activities,
            deletedActivityIds,
          ),
        ),
      );
      markServerDataStale();
      setMessage(
        wasPublished ? "Resubmitted for review." : "Submitted for review.",
      );
      finishTiming({ status: "success" });
    } catch {
      finishTiming({ status: "error" });
      setMessage(
        "Unable to submit report. Check your connection and try again.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteDraft() {
    if (!report.id || report.status !== "DRAFT") {
      return;
    }

    if (!window.confirm("Delete this draft? This cannot be undone.")) {
      return;
    }

    if (busyAction || importingProvider) {
      return;
    }

    const finishTiming = startClientTiming("daily:delete-draft");
    flushSync(() => {
      setBusyAction("delete");
      setMessage(null);
    });

    try {
      const response = await fetch(`/api/reports/${report.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setMessage((await response.json()).error ?? "Unable to delete draft.");
        finishTiming({ status: "delete-failed" });
        return;
      }

      const clearedReport: Report = {
        ...reportRef.current,
        id: "",
        summary: "",
        workLocation: "UNKNOWN" as WorkLocation,
        status: "DRAFT",
        activities: [],
        submittedAt: null,
        updatedAt: null,
      };
      const clearedPayload = buildReportPayload("", "UNKNOWN", [], []);

      reportRef.current = clearedReport;
      lastSavedSignatureRef.current = draftPayloadSignature(
        reportDate,
        clearedPayload,
      );
      latestDraftRef.current = {
        reportId: "",
        reportDate,
        payload: clearedPayload,
        signature: lastSavedSignatureRef.current,
        hasMeaningfulContent: false,
      };

      setReport(clearedReport);
      setSummary("");
      setWorkLocation("UNKNOWN");
      setActivities([]);
      setDeletedActivityIds([]);
      setSummaryEditorSnapshot({ summary: "" });
      markServerDataStale();
      setMessage("Draft deleted.");
      finishTiming({ status: "success" });
    } catch {
      finishTiming({ status: "error" });
      setMessage(
        "Unable to delete draft. Check your connection and try again.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function sync(provider: SyncProviderKey) {
    if (busyAction || importingProvider) {
      return;
    }

    const providerLabel = syncProviderLabels[provider];
    const finishTiming = startClientTiming("daily:sync", { provider });
    flushSync(() => {
      setImportingProvider(provider);
      setImportProgress({
        provider,
        stage: "starting",
        message: `Starting ${providerLabel} import...`,
      });
      setMessage(null);
    });

    try {
      const response = await fetch(`/api/sync/${provider}`, {
        method: "POST",
        headers: {
          Accept: "text/event-stream, application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ date }),
      });

      if (!response.ok) {
        setMessage(
          await responseErrorMessage(
            response,
            `${providerLabel} import failed.`,
          ),
        );
        finishTiming({ status: "request-failed" });
        return;
      }

      let result: SyncResponseBody | null = null;
      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream")) {
        await readServerSentEvents(response, {
          onEvent: (event, data) => {
            if (event === "progress" && data && typeof data === "object") {
              const progress = data as SyncProgressEvent;
              setImportProgress({
                provider,
                stage: progress.stage,
                message: progress.message,
              });
              return;
            }

            if (event === "result" && data && typeof data === "object") {
              result = data as SyncResponseBody;
              return;
            }

            if (event === "error" && data && typeof data === "object") {
              const message =
                typeof (data as { message?: unknown }).message === "string"
                  ? (data as { message: string }).message
                  : `${providerLabel} import failed.`;

              throw new Error(message);
            }
          },
        });
      } else {
        result = (await response.json()) as SyncResponseBody;
      }

      const syncResult = result;

      if (!syncResult) {
        throw new Error(`${providerLabel} import did not return results.`);
      }

      setActivities((current) =>
        mergeSyncedActivities(
          current,
          syncProviderSources[provider],
          syncResult.activities ?? [],
        ),
      );
      markServerDataStale();

      setMessage(
        syncResult.importedCount > 0
          ? `${providerLabel} import complete: ${syncResult.importedCount} work item${syncResult.importedCount === 1 ? "" : "s"} found${syncResult.staleCount ? `, ${syncResult.staleCount} stale item${syncResult.staleCount === 1 ? "" : "s"} hidden` : ""}.`
          : `No ${providerLabel.toLowerCase()} work items found for this date.`,
      );
      finishTiming({
        status: "success",
        importedCount: syncResult.importedCount,
      });
    } catch (error) {
      finishTiming({ status: "error" });
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : `${providerLabel} import failed. Check your connection and try again.`,
      );
    } finally {
      setImportingProvider(null);
      setImportProgress(null);
    }
  }

  async function addGoogleTask(task: GoogleTaskSuggestion) {
    if (busyAction || importingProvider || addingGoogleTaskKey) {
      return;
    }

    const snapshotBeforeTask = captureCurrentDraftSnapshot();
    const activitiesBeforeTask = activities;
    const wasDraftCleanBeforeTask =
      snapshotBeforeTask.signature === lastSavedSignatureRef.current;
    const taskKey = `${task.taskListId}:${task.taskId}`;
    flushSync(() => {
      setAddingGoogleTaskKey(taskKey);
      setMessage(null);
    });

    try {
      const response = await fetch("/api/reports/google-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          taskId: task.taskId,
          taskListId: task.taskListId,
        }),
      });

      if (!response.ok) {
        setMessage(
          await responseErrorMessage(response, "Unable to add Google Task."),
        );
        return;
      }

      const body = (await response.json()) as { report: Report };
      const returnedGoogleTasks = body.report.activities.filter(
        (activity) => activity.source === "GOOGLE_TASKS",
      );
      const savedActivities = mergeSyncedActivities(
        activitiesBeforeTask,
        "GOOGLE_TASKS",
        returnedGoogleTasks,
      );
      const nextReport: Report = {
        ...reportRef.current,
        id: body.report.id,
        reportDate: body.report.reportDate,
        status: body.report.status,
        submittedAt: body.report.submittedAt,
        updatedAt: body.report.updatedAt,
        revisions: body.report.revisions ?? reportRef.current.revisions,
      };
      reportRef.current = nextReport;
      setReport(nextReport);
      setActivities((current) =>
        mergeActivitiesById(current, returnedGoogleTasks),
      );
      if (
        wasDraftCleanBeforeTask &&
        latestDraftRef.current?.signature === snapshotBeforeTask.signature
      ) {
        const savedPayload = buildReportPayload(
          snapshotBeforeTask.payload.summary,
          snapshotBeforeTask.payload.workLocation,
          savedActivities,
          snapshotBeforeTask.payload.deletedActivityIds,
        );
        const savedSignature = draftPayloadSignature(reportDate, savedPayload);

        lastSavedSignatureRef.current = savedSignature;
        latestDraftRef.current = {
          reportId: nextReport.id,
          reportDate,
          payload: savedPayload,
          signature: savedSignature,
          hasMeaningfulContent: hasMeaningfulDraftPayload(savedPayload),
        };
      }
      markServerDataStale();
      setGoogleTaskQuery("");
      setGoogleTaskResults([]);
      setGoogleTaskSearchStatus("idle");
      setMessage("Google Task added to this report.");
    } catch {
      setMessage(
        "Unable to add Google Task. Check your connection and try again.",
      );
    } finally {
      setAddingGoogleTaskKey(null);
    }
  }

  async function copyActivityTitle(activity: Activity) {
    await navigator.clipboard?.writeText(activity.title);
    setOpenActivityMenu(null);
    setMessage("Activity title copied.");
  }

  function activityReferencePayload(
    activity: Activity,
  ): SummaryActivityReferenceDragPayload {
    return {
      activityId: activity.id,
      source: activity.source,
      title: activity.title || "Untitled activity",
      url: activity.sourceUrl,
    };
  }

  function updateActivityDragPreviewPosition(clientX: number, clientY: number) {
    if (clientX === 0 && clientY === 0) {
      return;
    }

    setActivityDragPreview((current) =>
      current
        ? {
            ...current,
            x: clientX,
            y: clientY,
          }
        : current,
    );
  }

  function dragActivityReference(
    activity: Activity,
    event: DragEvent<HTMLElement>,
  ) {
    if (isInteractiveActivityControl(event.target)) {
      event.preventDefault();
      return;
    }

    const payload = activityReferencePayload(activity);

    event.dataTransfer.effectAllowed = "copy";
    setTransparentDragImage(event.dataTransfer);
    event.dataTransfer.setData(
      summaryActivityReferenceDragType,
      JSON.stringify(payload),
    );
    setActivityDragPreview({
      id: activity.id,
      source: activity.source,
      title: payload.title,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function moveActivityReferenceDrag(event: DragEvent<HTMLElement>) {
    updateActivityDragPreviewPosition(event.clientX, event.clientY);
  }

  function endActivityReferenceDrag() {
    setActivityDragPreview(null);
  }

  const includeDroppedActivityReference = useCallback(
    (payload: SummaryActivityReferenceDragPayload) => {
      if (!payload.activityId) {
        return;
      }

      setActivities((items) =>
        items.map((item) =>
          item.id === payload.activityId ? { ...item, selected: true } : item,
        ),
      );
    },
    [],
  );

  function openActivitySource(activity: Activity) {
    if (!activity.sourceUrl || activity.sourceUrl === "#") {
      setMessage("This activity does not have a source link.");
      setOpenActivityMenu(null);
      return;
    }

    window.open(activity.sourceUrl, "_blank", "noopener,noreferrer");
    setOpenActivityMenu(null);
  }

  const canSyncJira = integrationStatus.atlassian;
  const canSyncGoogle = integrationStatus.google;
  const isSavingDraft = busyAction === "save";
  const isSubmitting = busyAction === "submit";
  const isDeleting = busyAction === "delete";
  const isImporting = importingProvider !== null;
  const isAddingGoogleTask = addingGoogleTaskKey !== null;
  const isPublishedReport = report.status === "SUBMITTED";
  const submitButtonText = isPublishedReport
    ? "Resubmit update"
    : "Submit update";
  const submitProgressText = isPublishedReport
    ? "Resubmitting..."
    : "Submitting...";
  const dateNavigationPending = pendingDateControl !== null;
  const isBusy =
    busyAction !== null ||
    isImporting ||
    dateNavigationPending ||
    isAddingGoogleTask;
  const maxReportDate = todayDateString();
  const visibleActivities = useMemo(
    () => activities.filter((activity) => activity.selected),
    [activities],
  );
  const workItemCount = visibleActivities.length;
  const currentPayload = buildReportPayload(
    summary,
    workLocation,
    activities,
    deletedActivityIds,
  );
  const currentDraftSignature = draftPayloadSignature(
    reportDate,
    currentPayload,
  );
  const currentDraftSnapshot: AutoDraftSnapshot = {
    reportId: report.id,
    reportDate,
    payload: currentPayload,
    signature: currentDraftSignature,
    hasMeaningfulContent: hasMeaningfulDraftPayload(currentPayload),
  };
  reportRef.current = report;
  latestDraftRef.current = currentDraftSnapshot;
  const canSaveDraft = canSaveDraftSnapshot(currentDraftSnapshot);
  const normalizedActivitySearch = activitySearch.trim().toLowerCase();
  const filteredActivities = normalizedActivitySearch
    ? visibleActivities.filter((activity) =>
        activitySearchText(activity).includes(normalizedActivitySearch),
      )
    : visibleActivities;
  const selectedWorkLocationLabel = workLocationLabel(workLocation);
  const activityReferences = useMemo(
    () =>
      Object.fromEntries(
        visibleActivities.map((activity) => [
          activity.id,
          {
            href: activity.sourceUrl,
            source: activity.source,
            title: activity.title,
          },
        ]),
      ),
    [visibleActivities],
  );

  async function goToReportDate(
    nextDate: string,
    control: ReportDateControl = "picker",
  ) {
    if (!nextDate) {
      return;
    }

    const targetDate = clampReportDateToToday(nextDate);

    if (targetDate === reportDate) {
      return;
    }

    if (busyAction || importingProvider) {
      return;
    }

    const snapshot = captureCurrentDraftSnapshot();
    if (
      canSaveDraftSnapshot(snapshot) &&
      !window.confirm("Discard unsaved changes and change dates?")
    ) {
      return;
    }

    const finishTiming = startClientTiming("daily:date-navigation", {
      from: reportDate,
      to: targetDate,
    });
    flushSync(() => {
      setPendingDateControl(control);
    });

    refreshStaleServerData(router);
    router.push(`/?date=${targetDate}`);
    finishTiming({ status: "push" });
  }

  function selectWorkLocation(nextLocation: WorkLocation) {
    setWorkLocation(nextLocation);
    setLocationMenuOpen(false);
  }

  function toggleLocationMenu() {
    if (isBusy) {
      return;
    }

    setLocationMenuOpen((open) => !open);
  }

  const menuActivity = openActivityMenu
    ? activities.find((activity) => activity.id === openActivityMenu.id)
    : null;
  return (
    <>
      <main className="reference-page daily-report-page min-[1200px]:flex min-[1200px]:h-full min-[1200px]:min-h-0 min-[1200px]:flex-col">
        <ReportPageHeader
          className="shrink-0 max-[639px]:gap-3"
          actionsClassName="max-[639px]:w-full max-[639px]:flex-col max-[639px]:items-stretch"
          title="Share what you worked on today"
          actions={
            <>
              <Button
                variant="outline"
                className="h-10 rounded-[8px] bg-white px-4 text-sm font-semibold text-[#344054] shadow-none ring-1 ring-[#dfe4ee] hover:bg-[#f8fafc] disabled:bg-[#f2f4f7] disabled:text-[#98a2b3] disabled:ring-[#d0d5dd] dark:bg-[#101d2e] dark:text-foreground dark:ring-[#263a55] dark:hover:bg-white/5 dark:disabled:bg-[#162235] dark:disabled:text-[#71809a] max-[639px]:w-full"
                disabled={isBusy || !canSaveDraft}
                onClick={saveDraft}
              >
                {isSavingDraft ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {isSavingDraft ? "Saving..." : "Save draft"}
              </Button>
              {report.id && report.status === "DRAFT" ? (
                <Button
                  variant="outline"
                  className="h-10 rounded-[8px] bg-white px-4 text-sm font-medium text-[#b42318] shadow-none ring-1 ring-[#f3b8b2] hover:bg-[#fff5f5] dark:bg-[#101d2e] dark:text-red-300 dark:ring-red-400/25 dark:hover:bg-red-400/10 max-[639px]:w-full"
                  disabled={isBusy}
                  onClick={deleteDraft}
                >
                  {isDeleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  {isDeleting ? "Deleting..." : "Delete draft"}
                </Button>
              ) : null}
              <Button
                className="h-10 rounded-[8px] bg-[#2563eb] px-5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.2)] hover:bg-[#1d4ed8] max-[639px]:w-full"
                disabled={isBusy}
                onClick={submitReport}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {isSubmitting ? submitProgressText : submitButtonText}
              </Button>
            </>
          }
        />

        <ReportSurface className="mb-3 shrink-0 max-[639px]:p-2.5">
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            <ReportDateSwitcher
              value={reportDate}
              maxDate={maxReportDate}
              pendingControl={pendingDateControl}
              disabled={isBusy}
              onChange={(nextDate, control) =>
                void goToReportDate(nextDate, control)
              }
            />

            <div
              ref={locationMenuRef}
              className="relative w-full sm:w-[220px]"
            >
              <button
                type="button"
                role="combobox"
                aria-label="Work location"
                aria-controls="work-location-menu"
                aria-expanded={locationMenuOpen}
                className="flex min-h-10 w-full items-center gap-3 rounded-[7px] bg-white px-3 text-sm shadow-none ring-1 ring-[#dfe4ee] transition-colors hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#101d2e] dark:ring-[#263a55] dark:hover:bg-white/5"
                disabled={isBusy}
                onClick={toggleLocationMenu}
              >
                <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[#667085] dark:text-muted-foreground">
                  Location
                </span>
                <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-[#111827] dark:text-foreground">
                  {selectedWorkLocationLabel}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-[#667085] transition-transform dark:text-muted-foreground",
                    locationMenuOpen && "rotate-180",
                  )}
                />
              </button>
              {locationMenuOpen ? (
                <div
                  id="work-location-menu"
                  role="listbox"
                  aria-label="Work location options"
                  className="absolute left-0 top-12 z-30 w-full rounded-[8px] bg-white p-1.5 shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-[#dfe4ee] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
                >
                  {workLocationOptions.map((option) => {
                    const selected = option.value === workLocation;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={cn(
                          "flex w-full items-center justify-between rounded-[7px] px-2.5 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]",
                          selected
                            ? "bg-[#eff6ff] text-[#1d4ed8] dark:bg-blue-400/10 dark:text-blue-100"
                            : "text-[#344054] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5",
                        )}
                        onClick={() => selectWorkLocation(option.value)}
                      >
                        <span>{option.label}</span>
                        {selected ? (
                          <CheckCircle2 className="h-4 w-4 text-[#2563eb] dark:text-blue-300" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </ReportSurface>

        <div className="daily-report-layout grid gap-3 min-[1200px]:min-h-0 min-[1200px]:flex-1 min-[1200px]:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)] min-[1500px]:grid-cols-[minmax(0,1.18fr)_minmax(480px,0.82fr)]">
          <ReportSurface className="daily-report-panel flex min-h-[520px] flex-col min-[1200px]:min-h-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-normal text-[#111827] dark:text-foreground">
                    Work items
                  </h2>
                  <ReferenceBadge
                    tone="neutral"
                    className="px-2.5 py-1 text-xs"
                  >
                    {workItemCount} item{workItemCount === 1 ? "" : "s"}
                  </ReferenceBadge>
                </div>
              </div>
              <div ref={importMenuRef} className="relative">
                <Button
                  variant="outline"
                  className="h-9 rounded-[7px] bg-white px-3 text-sm font-medium text-[#111827] shadow-none ring-1 ring-[#dfe4ee] hover:bg-[#f8fafc] dark:bg-[#0f1b2a] dark:text-foreground dark:ring-[#263a55]"
                  disabled={isBusy}
                  onClick={() => {
                    setOpenActivityMenu(null);
                    setImportMenuOpen((open) => !open);
                  }}
                >
                  {isImporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  <span className="max-w-[190px] truncate">
                    {importProgress
                      ? importProgress.message
                      : importingProvider
                        ? `Importing ${syncProviderLabels[importingProvider]}...`
                        : "Import"}
                  </span>
                  <ChevronDown
                    className={cn("ml-2 h-4 w-4", isImporting && "opacity-0")}
                    aria-hidden="true"
                  />
                </Button>
                {importMenuOpen ? (
                  <div className="absolute right-0 top-12 z-30 w-64 rounded-[12px] bg-white p-2 shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:ring-[#263a55]">
                    <button
                      className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:text-[#98a2b3] disabled:hover:bg-transparent dark:text-foreground dark:hover:bg-white/5 dark:disabled:text-[#64748b] dark:disabled:hover:bg-transparent"
                      disabled={!canSyncJira}
                      title={
                        canSyncJira
                          ? undefined
                          : "Connect Jira from Manage integrations first."
                      }
                      onClick={() => {
                        setImportMenuOpen(false);
                        sync("jira");
                      }}
                    >
                      Import Jira
                    </button>
                    <button
                      className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:text-[#98a2b3] disabled:hover:bg-transparent dark:text-foreground dark:hover:bg-white/5 dark:disabled:text-[#64748b] dark:disabled:hover:bg-transparent"
                      disabled={!canSyncGoogle}
                      title={
                        canSyncGoogle
                          ? undefined
                          : "Connect Google from Manage integrations first."
                      }
                      onClick={() => {
                        setImportMenuOpen(false);
                        sync("google-calendar");
                      }}
                    >
                      Import Google Calendar
                    </button>
                    <button
                      className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:text-[#98a2b3] disabled:hover:bg-transparent dark:text-foreground dark:hover:bg-white/5 dark:disabled:text-[#64748b] dark:disabled:hover:bg-transparent"
                      disabled={!canSyncGoogle}
                      title={
                        canSyncGoogle
                          ? undefined
                          : "Connect Google from Manage integrations first."
                      }
                      onClick={() => {
                        setImportMenuOpen(false);
                        sync("google-tasks");
                      }}
                    >
                      Import Google Tasks
                    </button>
                    <button
                      className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:text-[#98a2b3] disabled:hover:bg-transparent dark:text-foreground dark:hover:bg-white/5 dark:disabled:text-[#64748b] dark:disabled:hover:bg-transparent"
                      disabled={!canSyncGoogle}
                      title={
                        canSyncGoogle
                          ? undefined
                          : "Connect Google from Manage integrations first."
                      }
                      onClick={() => {
                        setImportMenuOpen(false);
                        setGoogleTaskFinderOpen(true);
                      }}
                    >
                      Find unfinished Google Tasks
                    </button>
                    <Link
                      className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#2563eb] hover:bg-[#eff6ff] dark:text-[#93c5fd] dark:hover:bg-white/5"
                      href="/settings#integrations"
                      onClick={() => setImportMenuOpen(false)}
                    >
                      Manage integrations
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>

            {googleTaskFinderOpen ? (
              <div className="mt-3 rounded-[8px] bg-[#f8fafc] p-2 ring-1 ring-[#dfe4ee] dark:bg-[#0b1523] dark:ring-[#263a55]">
                <div className="flex items-center gap-2">
                  <ReportSearchField
                    value={googleTaskQuery}
                    onValueChange={setGoogleTaskQuery}
                    placeholder="Find unfinished Google Tasks"
                    className="flex-1 dark:bg-[#101d2e] dark:ring-[#3a506d]"
                    aria-label="Find unfinished Google Tasks"
                  />
                  <button
                    type="button"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] text-[#667085] transition-colors hover:bg-[#eef2f7] hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground"
                    aria-label="Close Google Tasks finder"
                    onClick={() => {
                      setGoogleTaskFinderOpen(false);
                      setGoogleTaskQuery("");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {googleTaskSearchStatus === "loading" ? (
                  <div className="mt-2 flex items-center gap-2 px-1 py-1.5 text-xs font-medium text-[#667085] dark:text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Searching...
                  </div>
                ) : googleTaskSearchStatus === "error" ? (
                  <div className="mt-2 px-1 py-1.5 text-xs font-medium text-red-700 dark:text-red-300">
                    Could not search Google Tasks.
                  </div>
                ) : googleTaskQuery.trim().length >= 2 &&
                  googleTaskResults.length === 0 ? (
                  <div className="mt-2 px-1 py-1.5 text-xs font-medium text-[#667085] dark:text-muted-foreground">
                    No unfinished tasks found.
                  </div>
                ) : googleTaskResults.length > 0 ? (
                  <div className="mt-2 max-h-44 space-y-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
                    {googleTaskResults.map((task) => {
                      const taskKey = `${task.taskListId}:${task.taskId}`;
                      const isAdding = addingGoogleTaskKey === taskKey;

                      return (
                        <button
                          key={taskKey}
                          type="button"
                          className="flex w-full items-center gap-2 rounded-[7px] px-2 py-2 text-left transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:hover:bg-white/5"
                          disabled={Boolean(addingGoogleTaskKey)}
                          onClick={() => void addGoogleTask(task)}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-white text-[#2563eb] ring-1 ring-[#dfe4ee] dark:bg-[#101d2e] dark:ring-[#3a506d]">
                            {isAdding ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Plus className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-[#111827] dark:text-foreground">
                              {task.title}
                            </span>
                            <span className="block truncate text-xs text-[#667085] dark:text-muted-foreground">
                              {isAdding ? "Adding..." : task.taskListTitle}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            <ReportSearchField
              value={activitySearch}
              onValueChange={setActivitySearch}
              placeholder="Search work items"
              className="mt-3 dark:bg-[#0f1b2a]"
              aria-label="Search work items"
            />

            <div className="daily-work-items-list mt-3 min-h-[320px] space-y-2 overflow-y-auto overscroll-contain p-1 [scrollbar-gutter:stable] min-[1200px]:min-h-0 min-[1200px]:flex-1">
              {workItemCount === 0 ? (
                <EmptyReferenceState>
                  No activities yet. Import work from Jira, Calendar, or Tasks.
                </EmptyReferenceState>
              ) : filteredActivities.length === 0 ? (
                <EmptyReferenceState>
                  No work items match your search.
                </EmptyReferenceState>
              ) : (
                filteredActivities.map((activity) => {
                  const statusLabel = activityStatusLabel(activity);
                  const isRenamingActivity =
                    renamingActivity?.id === activity.id;

                  return (
                    <article
                      key={activity.id}
                      className={cn(
                        "flex min-w-0 flex-col gap-2 rounded-[8px] bg-white px-3 py-2.5 ring-1 ring-[#e1e6ef] transition-[opacity,transform,box-shadow] dark:bg-[#0f1b2a] dark:ring-[#263a55] min-[720px]:grid min-[720px]:min-h-[68px] min-[720px]:grid-cols-[24px_34px_minmax(0,1fr)_auto_58px_28px] min-[720px]:items-center min-[720px]:gap-2.5",
                        activityDragPreviewId === activity.id &&
                          "scale-[0.995] opacity-55",
                      )}
                    >
                      <div className="flex min-w-0 items-start gap-2.5 min-[720px]:contents">
                        <Checkbox
                          className="mt-1 min-[720px]:mt-0"
                          checked={activity.selected}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setActivity(activity.id, { selected: true });
                              return;
                            }

                            removeActivity(activity);
                          }}
                          aria-label={`Remove ${activity.title}`}
                        />
                        <div
                          draggable
                          title="Drag into the summary to reference this work item"
                          className="cursor-grab active:cursor-grabbing"
                          onDragStart={(event) =>
                            dragActivityReference(activity, event)
                          }
                          onDrag={moveActivityReferenceDrag}
                          onDragEnd={endActivityReferenceDrag}
                        >
                          <ReportActivitySourceIcon source={activity.source} />
                        </div>
                        <div className="min-w-0 flex-1 min-[720px]:flex-none">
                          <div
                            className={cn(
                              "break-words text-sm font-semibold text-[#111827] dark:text-foreground",
                              !isRenamingActivity && "min-[720px]:truncate",
                            )}
                          >
                            {isRenamingActivity ? (
                              <Input
                                value={renamingActivity.title}
                                onChange={(event) =>
                                  updateRenamingActivityTitle(
                                    activity.id,
                                    event.target.value,
                                  )
                                }
                                onBlur={(event) =>
                                  saveActivityTitle(
                                    activity,
                                    event.currentTarget.value,
                                  )
                                }
                                onFocus={(event) => event.currentTarget.select()}
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelRenamingActivity(activity.id);
                                    return;
                                  }

                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    saveActivityTitle(
                                      activity,
                                      event.currentTarget.value,
                                    );
                                  }
                                }}
                                autoFocus
                                aria-label="Task title"
                                className="h-7 rounded-[6px] bg-white px-2 text-sm font-semibold shadow-none ring-1 ring-[#93c5fd] focus-visible:ring-2 dark:bg-[#101d2e] dark:ring-[#3a506d]"
                              />
                            ) : activity.sourceUrl &&
                              activity.sourceUrl !== "#" ? (
                              <a
                                href={activity.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                draggable={false}
                                className="hover:text-[#2563eb]"
                              >
                                {activity.title || "Untitled activity"}
                              </a>
                            ) : (
                              activity.title || "Untitled activity"
                            )}
                          </div>
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#667085] dark:text-muted-foreground min-[720px]:flex-nowrap">
                            <span className="shrink-0">
                              {reportActivitySourceLabel(activity.source)}
                            </span>
                            {activity.description ? (
                              <>
                                <span className="text-[#98a2b3]">-</span>
                                <span className="min-w-0 break-words min-[720px]:truncate">
                                  {activity.description}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 pl-[3.875rem] min-[720px]:contents min-[720px]:pl-0">
                        {statusLabel ? (
                          <ReferenceBadge
                            tone={statusTone(activity.status)}
                            className="justify-self-start px-2.5 py-1 text-xs"
                          >
                            {statusLabel}
                          </ReferenceBadge>
                        ) : (
                          <span
                            className="hidden min-[720px]:block"
                            aria-hidden="true"
                          />
                        )}
                        <div className="text-sm font-medium text-[#111827] dark:text-foreground">
                          {formatReportDuration(activity.durationMinutes)}
                        </div>
                        <button
                          type="button"
                          draggable={false}
                          className="reference-menu-button"
                          aria-label={`More actions for ${activity.title}`}
                          onClick={(event) =>
                            toggleActivityMenu(activity.id, event)
                          }
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <div className="mt-auto border-t border-[#e6eaf2] pt-3 dark:border-[#263a55]">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#667085] dark:text-muted-foreground">
                <span>
                  {workItemCount} work item{workItemCount === 1 ? "" : "s"}
                  {workItemCount > 0
                    ? normalizedActivitySearch
                      ? `, ${filteredActivities.length} matching`
                      : ""
                    : ""}
                </span>
              </div>
            </div>
          </ReportSurface>

          <ReportSurface
            as="aside"
            className="daily-report-panel daily-summary-panel flex min-h-[520px] flex-col min-[1200px]:min-h-0"
          >
            <div>
              <h2 className="text-lg font-semibold tracking-normal text-[#111827] dark:text-foreground">
                Summary
              </h2>
            </div>
            <LazySummaryEditor
              ref={setSummaryEditorHandle}
              initialSummary={summaryEditorSeed}
              resetKey={`${date}:${initialReport.id}:${initialReport.updatedAt ?? ""}`}
              activityReferences={activityReferences}
              onChange={handleSummaryChange}
              onActivityReferenceDrop={includeDroppedActivityReference}
            />
          </ReportSurface>
        </div>
      </main>
      {menuActivity && openActivityMenu ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            aria-label="Close work item menu"
            onClick={() => setOpenActivityMenu(null)}
          />
          <div
            ref={activityMenuRef}
            className="fixed z-50 w-60 rounded-[10px] bg-white p-1 text-sm shadow-[0_18px_42px_rgba(15,23,42,0.22)] dark:bg-[#0f1b2a]"
            style={{ top: openActivityMenu.top, left: openActivityMenu.left }}
            role="menu"
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[#334155] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
              onClick={() => openActivitySource(menuActivity)}
            >
              <ExternalLink className="h-4 w-4" />
              Open source
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[#334155] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
              onClick={() => startRenamingActivity(menuActivity)}
            >
              <Edit3 className="h-4 w-4" />
              Rename
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[#334155] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
              onClick={() => copyActivityTitle(menuActivity)}
            >
              <Copy className="h-4 w-4" />
              Copy title
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[#dc2626] hover:bg-[#fef2f2] dark:hover:bg-red-400/10"
              onClick={() => removeActivity(menuActivity)}
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </button>
          </div>
        </>
      ) : null}
      {activityDragPreview ? (
        <div
          className="activity-drag-preview pointer-events-none fixed z-[80] flex max-w-[320px] items-center gap-3 rounded-[12px] bg-white/95 px-3 py-2.5 text-sm text-[#111827] shadow-[0_18px_42px_rgba(15,23,42,0.22)] ring-1 ring-[#dbe5f4] backdrop-blur dark:bg-[#0f1b2a]/95 dark:text-foreground dark:ring-[#263a55]"
          style={{
            left: activityDragPreview.x,
            top: activityDragPreview.y,
          }}
          aria-hidden="true"
        >
          <ReportActivitySourceIcon
            source={activityDragPreview.source}
            className="rounded-[8px]"
          />
          <span className="min-w-0">
            <span className="block truncate font-semibold">
              {activityDragPreview.title}
            </span>
            <span className="block truncate text-xs text-[#667085] dark:text-muted-foreground">
              {reportActivitySourceLabel(activityDragPreview.source)}
            </span>
          </span>
        </div>
      ) : null}
      <FixedToast message={message} onDismiss={() => setMessage(null)} />
    </>
  );
}
