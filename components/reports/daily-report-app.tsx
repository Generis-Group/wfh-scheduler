"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DragEvent, MouseEvent as ReactMouseEvent } from "react";
import type { SVGProps } from "react";
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
import {
  addReportDateDays,
  clampReportDateToToday,
  todayDateString,
} from "@/lib/dates";
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
  hasRequiredWorkLocation,
  hasSubmitReadyContent,
  missingWorkLocationSubmitMessage,
} from "@/lib/report-submit-readiness";
import {
  dailyWorkLocationValues,
  plannedWorkLocationValues,
  workLocationLabel,
  type PlannedWorkLocationValue,
  type WorkLocationValue,
} from "@/lib/work-locations";
import type { SyncProgressEvent } from "@/lib/services/sync";
import { cn } from "@/lib/utils";

type ActivitySource =
  | "JIRA"
  | "GOOGLE_CALENDAR"
  | "GOOGLE_TASKS"
  | "GMAIL"
  | "GOOGLE_CHAT"
  | "MANUAL";

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
  isNew?: boolean;
};

type Report = {
  id: string;
  reportDate: string | Date;
  workLocation: WorkLocationValue;
  summary: string;
  status: "DRAFT" | "SUBMITTED";
  submittedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  activities: Activity[];
  revisions?: Array<{ id: string; createdAt: string | Date }>;
};

type WorkLocation = Report["workLocation"];

type PlannedWorkLocation = {
  id?: string;
  userId?: string;
  date: string;
  workLocation: PlannedWorkLocationValue;
};

const emptyWeeklyPlannedLocations: PlannedWorkLocation[] = [];

type IntegrationStatus = {
  google: boolean;
  atlassian: boolean;
};

const syncProviderLabels = {
  jira: "Jira",
  "google-calendar": "Calendar",
  "google-tasks": "Tasks",
  gmail: "Gmail",
  "google-chat": "Google Chat",
} as const;

const workLocationOptions = dailyWorkLocationValues.map((value) => ({
  value,
  label: workLocationLabel(value),
}));

const weeklyPlanLocationOptions = plannedWorkLocationValues.map((value) => ({
  value,
  label: workLocationLabel(value),
}));

const interactiveActivityControlSelector =
  "a, button, input, textarea, select, [role='button'], [role='textbox'], [contenteditable='true']";
type BusyAction = "save" | "submit" | "delete" | "summarize";
type SyncProviderKey = keyof typeof syncProviderLabels;
const syncProviderSources: Record<SyncProviderKey, ActivitySource> = {
  jira: "JIRA",
  "google-calendar": "GOOGLE_CALENDAR",
  "google-tasks": "GOOGLE_TASKS",
  gmail: "GMAIL",
  "google-chat": "GOOGLE_CHAT",
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
    id?: string;
    title: string;
    employeeNote: string | null;
    selected: boolean;
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
  current?: number;
  total?: number;
};
type SyncResponseBody = {
  importedCount: number;
  skippedCount: number;
  staleCount?: number;
  activities?: Activity[];
  report?: Pick<
    Report,
    | "id"
    | "reportDate"
    | "workLocation"
    | "summary"
    | "status"
    | "submittedAt"
    | "updatedAt"
  >;
};
type SyncOutcome =
  | { ok: true; provider: SyncProviderKey; result: SyncResponseBody }
  | { ok: false; provider: SyncProviderKey; message: string };

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

function dateInputValue(value: string | Date) {
  return dateOnlyString(value);
}

function reportWeekDates(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  const weekday = date.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = addReportDateDays(value, mondayOffset);
  const dates: string[] = [];

  for (let index = 0; index < 7; index += 1) {
    dates.push(addReportDateDays(start, index));
  }

  return dates;
}

function shortWeekdayLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
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
  const status = activity.status?.trim();
  const normalizedStatus = status?.toLowerCase();

  if (activity.source === "MANUAL" && normalizedStatus === "noted") {
    return "Noted";
  }

  if (!status || normalizedStatus === "noted") {
    return null;
  }

  if (activity.source === "GOOGLE_TASKS" && normalizedStatus === "completed") {
    return "Done";
  }

  return status;
}

function setTransparentDragImage(dataTransfer: DataTransfer) {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  dataTransfer.setDragImage(canvas, 0, 0);
}

function manualActivityId() {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `manual-${randomId}`;
}

function GeminiLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <defs>
        <linearGradient
          id="gemini-summary-gradient"
          x1="3"
          x2="21"
          y1="21"
          y2="3"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="0.48" stopColor="#2563eb" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <path
        fill="url(#gemini-summary-gradient)"
        d="M12 2.5c1.12 4.84 4.66 8.38 9.5 9.5-4.84 1.12-8.38 4.66-9.5 9.5-1.12-4.84-4.66-8.38-9.5-9.5 4.84-1.12 8.38-4.66 9.5-9.5Z"
      />
    </svg>
  );
}

function editorSummaryForReport(report: Report) {
  return report.summary;
}

function isNewManualActivity(activity: Activity) {
  return activity.source === "MANUAL" && Boolean(activity.isNew);
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
        id: activity.id,
        title: activity.title,
        employeeNote: activity.employeeNote ?? null,
        selected: activity.selected,
        status: activity.status,
        durationMinutes: activity.durationMinutes ?? null,
      })),
  };
}

function importResultMessage(providerLabel: string, result: SyncResponseBody) {
  const staleCount = result.staleCount ?? 0;
  const staleText = staleCount
    ? `, ${staleCount} stale item${staleCount === 1 ? "" : "s"} hidden`
    : "";

  if (result.importedCount > 0) {
    return `${providerLabel} import complete: ${result.importedCount} work item${result.importedCount === 1 ? "" : "s"} found${staleText}.`;
  }

  if (staleCount > 0) {
    return `${providerLabel} import complete: ${staleCount} stale item${staleCount === 1 ? "" : "s"} hidden.`;
  }

  return `No ${providerLabel.toLowerCase()} work items found for this date.`;
}

function importAllResultMessage(outcomes: SyncOutcome[]) {
  let importedCount = 0;
  let staleCount = 0;
  const failed: Array<Extract<SyncOutcome, { ok: false }>> = [];

  for (const outcome of outcomes) {
    if (outcome.ok) {
      importedCount += outcome.result.importedCount;
      staleCount += outcome.result.staleCount ?? 0;
      continue;
    }

    failed.push(outcome);
  }
  const staleText = staleCount
    ? `, ${staleCount} stale item${staleCount === 1 ? "" : "s"} hidden`
    : "";
  const failureText = failed.length
    ? ` ${failed.map((outcome) => syncProviderLabels[outcome.provider]).join(", ")} import${failed.length === 1 ? "" : "s"} failed.`
    : "";

  if (importedCount > 0) {
    return `Import complete: ${importedCount} work item${importedCount === 1 ? "" : "s"} found${staleText}.${failureText}`;
  }

  if (staleCount > 0) {
    return `Import complete: ${staleCount} stale item${staleCount === 1 ? "" : "s"} hidden.${failureText}`;
  }

  if (failed.length > 0) {
    return failed.map((outcome) => outcome.message).join(" ");
  }

  return "No work items found for this date.";
}

function importProgressPercent(progress: ImportProgress) {
  if (progress.stage === "complete") {
    return 100;
  }

  const hasCount =
    typeof progress.current === "number" &&
    typeof progress.total === "number" &&
    progress.total > 0;
  const countRatio = hasCount
    ? Math.min(1, Math.max(0, progress.current! / progress.total!))
    : 0;

  if (progress.stage === "starting") {
    return 8;
  }

  if (progress.stage === "connecting") {
    return 18;
  }

  if (progress.stage === "finding") {
    return Math.round(30 + countRatio * 42);
  }

  if (progress.stage === "saving") {
    return 88;
  }

  return 12;
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
  weeklyPlannedLocations = emptyWeeklyPlannedLocations,
}: {
  initialReport: Report;
  date: string;
  integrationStatus?: IntegrationStatus;
  weeklyPlannedLocations?: PlannedWorkLocation[];
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
  const [weeklyPlan, setWeeklyPlan] = useState(weeklyPlannedLocations);
  const [savingPlanDate, setSavingPlanDate] = useState<string | null>(null);
  const [pendingLocationOverride, setPendingLocationOverride] =
    useState<WorkLocation | null>(null);
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
  const [activityDragPreview, setActivityDragPreview] =
    useState<ActivityDragPreview | null>(null);
  const summaryEditorRef = useRef<SummaryEditorHandle | null>(null);
  const pendingSummarySnapshotRef = useRef<SummarySnapshot | null>(null);
  const locationMenuRef = useRef<HTMLDivElement | null>(null);
  const importMenuRef = useRef<HTMLDivElement | null>(null);
  const activityMenuRef = useRef<HTMLDivElement | null>(null);
  const activityMenuOpenedAtRef = useRef(0);
  const reportRef = useRef(initialReport);
  const activitiesRef = useRef(initialReport.activities);
  const latestDraftRef = useRef<AutoDraftSnapshot | null>(null);
  const lastSavedSignatureRef = useRef(
    draftPayloadSignature(reportDate, initialPayload),
  );
  const confirmedPlanOverrideRef = useRef(false);
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
    activitiesRef.current = initialReport.activities;
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
    setWeeklyPlan(weeklyPlannedLocations);
    setSavingPlanDate(null);
    setPendingLocationOverride(null);
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
    setPendingDateControl(null);
    confirmedPlanOverrideRef.current = false;
    pendingSummarySnapshotRef.current = null;
  }, [initialReport, date, reportDate, weeklyPlannedLocations]);

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

  function removeSummaryReferencesForActivities(activityIds: string[]) {
    const snapshot = summaryEditorRef.current?.getSnapshot() ??
      pendingSummarySnapshotRef.current ?? { summary };
    const nextSummary = removeSummaryActivityReferences(
      snapshot.summary,
      activityIds,
    );

    if (nextSummary === snapshot.summary) {
      return;
    }

    const nextSnapshot = { summary: nextSummary };
    setSummaryEditorSnapshot(nextSnapshot);
    handleSummaryChange(nextSnapshot);
  }

  function removeSummaryReferencesForActivity(activityId: string) {
    removeSummaryReferencesForActivities([activityId]);
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

    setActivities((items) => items.filter((item) => item.id !== activity.id));
    if (!isNewManualActivity(activity)) {
      setDeletedActivityIds((current) => [
        ...new Set([...current, activity.id]),
      ]);
    }
    setOpenActivityMenu(null);
    setRenamingActivity(null);
  }

  function clearActivities() {
    if (isBusy || activities.length === 0) {
      return;
    }

    const activityIds = activities.map((activity) => activity.id);
    const deletedIds = activities
      .filter((activity) => !isNewManualActivity(activity))
      .map((activity) => activity.id);

    removeSummaryReferencesForActivities(activityIds);
    setActivities([]);
    if (deletedIds.length > 0) {
      setDeletedActivityIds((current) => [
        ...new Set([...current, ...deletedIds]),
      ]);
    }
    setActivitySearch("");
    setOpenActivityMenu(null);
    setImportMenuOpen(false);
    setRenamingActivity(null);
    setMessage("Work items cleared.");
  }

  function addManualActivity() {
    if (isBusy) {
      return;
    }

    const id = manualActivityId();
    const activity: Activity = {
      id,
      source: "MANUAL",
      title: "New work item",
      description: null,
      status: "noted",
      sourceUrl: null,
      startedAt: null,
      durationMinutes: null,
      selected: true,
      employeeNote: null,
      isNew: true,
    };

    setActivities((items) => [activity, ...items]);
    setActivitySearch("");
    setOpenActivityMenu(null);
    setImportMenuOpen(false);
    setRenamingActivity({ id, title: activity.title });
    setMessage("Manual work item added.");
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
    event: ReactMouseEvent<HTMLButtonElement>,
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

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      const snapshot = captureCurrentDraftSnapshot({ syncState: false });

      if (!canSaveDraftSnapshot(snapshot)) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [canSaveDraftSnapshot, captureCurrentDraftSnapshot]);

  useEffect(() => {
    function warnBeforePageNavigation(event: globalThis.MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      if (!(event.target instanceof Element)) {
        return;
      }

      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");

      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      ) {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.href);
      const currentUrl = new URL(window.location.href);
      const sameRoute =
        nextUrl.origin === currentUrl.origin &&
        nextUrl.pathname === currentUrl.pathname &&
        nextUrl.search === currentUrl.search;

      if (sameRoute) {
        return;
      }

      const snapshot = captureCurrentDraftSnapshot({ syncState: false });

      if (!canSaveDraftSnapshot(snapshot)) {
        return;
      }

      if (!window.confirm("Discard unsaved changes and leave this update?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    document.addEventListener("click", warnBeforePageNavigation, true);

    return () => {
      document.removeEventListener("click", warnBeforePageNavigation, true);
    };
  }, [canSaveDraftSnapshot, captureCurrentDraftSnapshot]);

  function applySavedReport(
    nextReport: Report,
    replaceLocalState: boolean,
    savedSignature: string,
  ) {
    if (!replaceLocalState) {
      const current = reportRef.current;
      const savedActivityIds = new Set(
        nextReport.activities.map((activity) => activity.id),
      );
      const nextActivities = activitiesRef.current.map((activity) =>
        savedActivityIds.has(activity.id)
          ? { ...activity, isNew: false }
          : activity,
      );
      const nextCurrent = {
        ...current,
        id: nextReport.id,
        reportDate: nextReport.reportDate,
        status: nextReport.status,
        submittedAt: nextReport.submittedAt,
        updatedAt: nextReport.updatedAt,
        activities: nextActivities,
        revisions: nextReport.revisions ?? current.revisions,
      };

      reportRef.current = nextCurrent;
      activitiesRef.current = nextActivities;
      setReport(nextCurrent);
      setActivities(nextActivities);
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
    activitiesRef.current = nextReport.activities;
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

  function applySyncedDraftReport(
    syncedReport: NonNullable<SyncResponseBody["report"]>,
    nextActivities: Activity[],
  ) {
    const current = reportRef.current;
    const nextReport = {
      ...current,
      id: syncedReport.id,
      reportDate: syncedReport.reportDate,
      workLocation: syncedReport.workLocation,
      summary: syncedReport.summary,
      status: syncedReport.status,
      submittedAt: syncedReport.submittedAt,
      updatedAt: syncedReport.updatedAt,
      activities: nextActivities,
    };
    const syncedReportDate = dateInputValue(syncedReport.reportDate);
    const savedActivities = nextActivities.filter(
      (activity) => !isNewManualActivity(activity),
    );
    const savedPayload = buildReportPayload(
      syncedReport.summary,
      syncedReport.workLocation,
      savedActivities,
      [],
    );

    reportRef.current = nextReport;
    lastSavedSignatureRef.current = draftPayloadSignature(
      syncedReportDate,
      savedPayload,
    );
    setReport(nextReport);
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
      const replaceLocalState =
        latestDraftRef.current?.signature === savedSignature;

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
    if (busyAction || importingProvider) {
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

    if (!hasRequiredWorkLocation(snapshot.payload.workLocation)) {
      setMessage(missingWorkLocationSubmitMessage);
      return;
    }

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
      refreshStaleServerData(router);
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

  async function sync(
    provider: SyncProviderKey,
    { showResultMessage = true }: { showResultMessage?: boolean } = {},
  ): Promise<SyncOutcome | null> {
    if (busyAction || importingProvider) {
      return null;
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
        const message = await responseErrorMessage(
          response,
          `${providerLabel} import failed.`,
        );
        if (showResultMessage) {
          setMessage(message);
        }
        finishTiming({ status: "request-failed" });
        return { ok: false, provider, message };
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
                current: progress.current,
                total: progress.total,
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

      const nextActivities = mergeSyncedActivities(
        activitiesRef.current,
        syncProviderSources[provider],
        syncResult.activities ?? [],
      );
      const syncedActivityIds = new Set(
        (syncResult.activities ?? []).map((activity) => activity.id),
      );

      activitiesRef.current = nextActivities;
      setActivities(nextActivities);
      if (syncedActivityIds.size > 0) {
        setDeletedActivityIds((current) =>
          current.filter((id) => !syncedActivityIds.has(id)),
        );
      }

      if (syncResult.report) {
        applySyncedDraftReport(syncResult.report, nextActivities);
      }

      markServerDataStale();

      if (showResultMessage) {
        setMessage(importResultMessage(providerLabel, syncResult));
      }
      finishTiming({
        status: "success",
        importedCount: syncResult.importedCount,
      });
      return { ok: true, provider, result: syncResult };
    } catch (error) {
      finishTiming({ status: "error" });
      const message =
        error instanceof Error && error.message
          ? error.message
          : `${providerLabel} import failed. Check your connection and try again.`;
      if (showResultMessage) {
        setMessage(message);
      }
      return { ok: false, provider, message };
    } finally {
      setImportingProvider(null);
      setImportProgress(null);
    }
  }

  async function syncAll() {
    if (busyAction || importingProvider) {
      return;
    }

    const providers: SyncProviderKey[] = [
      ...(canSyncJira ? (["jira"] as const) : []),
      ...(canSyncGoogle
        ? (["google-calendar", "google-tasks", "gmail", "google-chat"] as const)
        : []),
    ];

    const outcomes: SyncOutcome[] = [];

    for (const provider of providers) {
      const outcome = await sync(provider, { showResultMessage: false });

      if (outcome) {
        outcomes.push(outcome);
      }
    }

    if (outcomes.length > 0) {
      setMessage(importAllResultMessage(outcomes));
    }
  }

  async function summarizeWithAi() {
    if (busyAction || importingProvider || workItemCount === 0) {
      return;
    }

    const snapshot = captureCurrentDraftSnapshot();

    if (
      snapshot.payload.summary.trim() &&
      !window.confirm(
        "Replace the current summary with an AI-generated summary?",
      )
    ) {
      return;
    }

    const finishTiming = startClientTiming("daily:ai-summary", {
      hasReport: Boolean(snapshot.reportId || reportRef.current.id),
      workItemCount,
    });

    flushSync(() => {
      setBusyAction("summarize");
      setMessage(null);
    });

    try {
      const saved = await saveDraftSnapshot(snapshot, {
        forceCreate: !reportRef.current.id,
        timingName: "daily:ai-summary-save",
      });

      if (!saved?.id) {
        setMessage("Save failed. Try again before summarizing with AI.");
        finishTiming({ status: "save-failed" });
        return;
      }

      const response = await fetch(`/api/reports/${saved.id}/summary/ai`, {
        method: "POST",
      });

      if (!response.ok) {
        setMessage(
          await responseErrorMessage(
            response,
            "Unable to summarize with AI. Try again.",
          ),
        );
        finishTiming({ status: "summarize-failed" });
        return;
      }

      const body = (await response.json().catch(() => null)) as {
        summary?: unknown;
      } | null;
      const nextSummary =
        typeof body?.summary === "string" ? body.summary.trim() : "";

      if (!nextSummary) {
        setMessage("Unable to summarize with AI. Try again.");
        finishTiming({ status: "empty-summary" });
        return;
      }

      const nextSnapshot = { summary: nextSummary };
      setSummaryEditorSnapshot(nextSnapshot);
      handleSummaryChange(nextSnapshot);
      setMessage("AI summary added. Review and save when ready.");
      finishTiming({ status: "success" });
    } catch {
      finishTiming({ status: "error" });
      setMessage("Unable to summarize with AI. Try again.");
    } finally {
      setBusyAction(null);
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
  const canSyncAnyIntegration = canSyncJira || canSyncGoogle;
  const isSavingDraft = busyAction === "save";
  const isSubmitting = busyAction === "submit";
  const isDeleting = busyAction === "delete";
  const isSummarizing = busyAction === "summarize";
  const isImporting = importingProvider !== null;
  const importProgressValue = importProgress
    ? importProgressPercent(importProgress)
    : 0;
  const isPublishedReport = report.status === "SUBMITTED";
  const submitButtonText = isPublishedReport
    ? "Resubmit update"
    : "Submit update";
  const submitProgressText = isPublishedReport
    ? "Resubmitting..."
    : "Submitting...";
  const dateNavigationPending = pendingDateControl !== null;
  const isBusy = busyAction !== null || isImporting || dateNavigationPending;
  const maxReportDate = todayDateString();
  const planWeekDates = useMemo(
    () => reportWeekDates(reportDate),
    [reportDate],
  );
  const weeklyPlanByDate = useMemo(
    () => new Map(weeklyPlan.map((plan) => [plan.date, plan])),
    [weeklyPlan],
  );
  const plannedLocationForReport =
    weeklyPlanByDate.get(reportDate)?.workLocation ?? null;
  const selectedActivities = useMemo(
    () => activities.filter((activity) => activity.selected),
    [activities],
  );
  const workItemCount = selectedActivities.length;
  const canSummarizeWithAi = workItemCount > 0;
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
  activitiesRef.current = activities;
  latestDraftRef.current = currentDraftSnapshot;
  const canSaveDraft = canSaveDraftSnapshot(currentDraftSnapshot);
  const normalizedActivitySearch = activitySearch.trim().toLowerCase();
  const filteredActivities = normalizedActivitySearch
    ? activities.filter((activity) =>
        activitySearchText(activity).includes(normalizedActivitySearch),
      )
    : activities;
  const selectedWorkLocationLabel = workLocationLabel(workLocation);
  const planMismatch =
    Boolean(plannedLocationForReport) &&
    workLocation !== "UNKNOWN" &&
    workLocation !== plannedLocationForReport;
  const activityReferences = useMemo(
    () =>
      Object.fromEntries(
        selectedActivities.map((activity) => [
          activity.id,
          {
            href: activity.sourceUrl,
            source: activity.source,
            title: activity.title,
          },
        ]),
      ),
    [selectedActivities],
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

  function applyWorkLocation(nextLocation: WorkLocation) {
    setWorkLocation(nextLocation);
    setLocationMenuOpen(false);
    setPendingLocationOverride(null);
  }

  function selectWorkLocation(nextLocation: WorkLocation) {
    if (
      plannedLocationForReport &&
      nextLocation !== "UNKNOWN" &&
      nextLocation !== plannedLocationForReport &&
      !confirmedPlanOverrideRef.current
    ) {
      setPendingLocationOverride(nextLocation);
      setLocationMenuOpen(false);
      return;
    }

    applyWorkLocation(nextLocation);
  }

  function confirmPlanOverride() {
    if (!pendingLocationOverride) {
      return;
    }

    confirmedPlanOverrideRef.current = true;
    applyWorkLocation(pendingLocationOverride);
  }

  function keepPlannedLocation() {
    if (plannedLocationForReport) {
      applyWorkLocation(plannedLocationForReport);
    }

    setPendingLocationOverride(null);
  }

  async function saveWeeklyPlan(
    dateString: string,
    nextLocation: PlannedWorkLocationValue | null,
  ) {
    if (savingPlanDate) {
      return;
    }

    const previousPlan = weeklyPlanByDate.get(dateString)?.workLocation ?? null;
    setSavingPlanDate(dateString);
    setMessage(null);

    try {
      const response = await fetch("/api/work-location-plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateString,
          workLocation: nextLocation,
        }),
      });

      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Unable to update weekly plan."),
        );
      }

      const body = (await response.json()) as {
        plan?: PlannedWorkLocation | null;
      };
      setWeeklyPlan((current) => [
        ...current.filter((plan) => plan.date !== dateString),
        ...(body.plan ? [body.plan] : []),
      ]);
      markServerDataStale();

      if (
        dateString === reportDate &&
        !reportRef.current.id &&
        (workLocation === "UNKNOWN" || workLocation === previousPlan)
      ) {
        setWorkLocation(nextLocation ?? "UNKNOWN");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update weekly plan.",
      );
    } finally {
      setSavingPlanDate(null);
    }
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

            <div ref={locationMenuRef} className="relative w-full sm:w-[220px]">
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
          {pendingLocationOverride && plannedLocationForReport ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[8px] bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-300/10 dark:text-amber-100 dark:ring-amber-300/20">
              <span className="min-w-0 flex-1">
                Your weekly plan says{" "}
                <strong>{workLocationLabel(plannedLocationForReport)}</strong>{" "}
                for this day. Use{" "}
                <strong>{workLocationLabel(pendingLocationOverride)}</strong>{" "}
                for this daily report instead?
              </span>
              <Button
                type="button"
                className="h-8 rounded-[7px] bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700"
                onClick={confirmPlanOverride}
              >
                Use {workLocationLabel(pendingLocationOverride)}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-[7px] bg-white px-3 text-xs font-semibold text-amber-950 ring-1 ring-amber-200 hover:bg-amber-50 dark:bg-transparent dark:text-amber-100 dark:ring-amber-300/30 dark:hover:bg-amber-300/10"
                onClick={keepPlannedLocation}
              >
                Keep {workLocationLabel(plannedLocationForReport)}
              </Button>
            </div>
          ) : planMismatch ? (
            <div className="mt-2 text-xs font-medium text-[#667085] dark:text-muted-foreground">
              Different from weekly plan
            </div>
          ) : null}
          <div className="mt-3 rounded-[8px] bg-[#f8fbff] p-2 ring-1 ring-[#dbe7ff] dark:bg-blue-400/5 dark:ring-blue-300/15">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#667085] dark:text-muted-foreground">
              Weekly plan
            </div>
            <div className="grid gap-2 min-[720px]:grid-cols-7">
              {planWeekDates.map((planDate) => {
                const plan = weeklyPlanByDate.get(planDate);
                const saving = savingPlanDate === planDate;

                return (
                  <label key={planDate} className="grid gap-1">
                    <span className="text-[11px] font-semibold text-[#667085] dark:text-muted-foreground">
                      {shortWeekdayLabel(planDate)}
                    </span>
                    <select
                      className="h-8 min-w-0 rounded-[7px] bg-white px-2 text-xs font-medium text-[#111827] ring-1 ring-[#dfe4ee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:opacity-60 dark:bg-[#101d2e] dark:text-foreground dark:ring-[#263a55]"
                      value={plan?.workLocation ?? ""}
                      disabled={isBusy || saving}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        void saveWeeklyPlan(
                          planDate,
                          nextValue
                            ? (nextValue as PlannedWorkLocationValue)
                            : null,
                        );
                      }}
                    >
                      <option value="">No plan</option>
                      {weeklyPlanLocationOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          </div>
        </ReportSurface>

        <div className="daily-report-layout grid gap-3 min-[1200px]:min-h-0 min-[1200px]:flex-1 min-[1200px]:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)] min-[1500px]:grid-cols-[minmax(0,1.18fr)_minmax(480px,0.82fr)]">
          <ReportSurface className="daily-report-panel flex min-h-[520px] flex-col min-[1200px]:min-h-0">
            <div className="grid gap-3 min-[900px]:flex min-[900px]:items-start min-[900px]:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-normal text-[#111827] dark:text-foreground">
                    Work items
                  </h2>
                </div>
              </div>
              <div className="grid min-w-0 grid-cols-3 gap-2 min-[900px]:flex min-[900px]:w-auto min-[900px]:flex-wrap min-[900px]:items-center min-[1200px]:gap-1.5">
                <Button
                  variant="outline"
                  className="h-9 min-w-0 justify-center rounded-[7px] bg-white px-3 text-sm font-medium text-[#111827] shadow-none ring-1 ring-[#dfe4ee] hover:bg-[#f8fafc] dark:bg-[#0f1b2a] dark:text-foreground dark:ring-[#263a55] min-[900px]:w-auto min-[1200px]:h-8 min-[1200px]:px-2.5 min-[1200px]:text-xs"
                  disabled={isBusy}
                  onClick={addManualActivity}
                >
                  <Plus className="mr-2 h-4 w-4 shrink-0 min-[1200px]:mr-1.5 min-[1200px]:h-3.5 min-[1200px]:w-3.5" />
                  <span className="min-w-0 truncate">Add item</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-9 min-w-0 justify-center rounded-[7px] bg-white px-3 text-sm font-medium text-[#111827] shadow-none ring-1 ring-[#dfe4ee] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:text-[#98a2b3] disabled:hover:bg-white dark:bg-[#0f1b2a] dark:text-foreground dark:ring-[#263a55] dark:disabled:text-[#64748b] dark:disabled:hover:bg-[#0f1b2a] min-[900px]:w-auto min-[1200px]:h-8 min-[1200px]:px-2.5 min-[1200px]:text-xs"
                  disabled={isBusy || activities.length === 0}
                  aria-label="Clear work items"
                  onClick={clearActivities}
                >
                  <Trash2 className="mr-2 h-4 w-4 shrink-0 min-[1200px]:mr-1.5 min-[1200px]:h-3.5 min-[1200px]:w-3.5" />
                  <span className="min-w-0 truncate">Clear</span>
                </Button>
                <div
                  ref={importMenuRef}
                  className="relative min-w-0 min-[900px]:w-[176px] min-[1200px]:w-[142px]"
                >
                  <Button
                    variant="outline"
                    className={cn(
                      "relative h-9 w-full min-w-0 justify-center overflow-hidden rounded-[7px] bg-white px-3 text-sm font-medium text-[#111827] shadow-none ring-1 ring-[#dfe4ee] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:text-[#98a2b3] disabled:hover:bg-white dark:bg-[#0f1b2a] dark:text-foreground dark:ring-[#263a55] dark:disabled:text-[#64748b] dark:disabled:hover:bg-[#0f1b2a] min-[1200px]:h-8 min-[1200px]:px-2.5 min-[1200px]:text-xs",
                      "py-2 min-[1200px]:py-1.5",
                    )}
                    disabled={isBusy && !isImporting}
                    aria-disabled={isBusy}
                    onClick={() => {
                      if (isBusy) {
                        return;
                      }

                      setOpenActivityMenu(null);
                      setImportMenuOpen((open) => !open);
                    }}
                  >
                    {isImporting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin min-[1200px]:mr-1.5 min-[1200px]:h-3.5 min-[1200px]:w-3.5" />
                    ) : (
                      <Download className="mr-2 h-4 w-4 shrink-0 min-[1200px]:mr-1.5 min-[1200px]:h-3.5 min-[1200px]:w-3.5" />
                    )}
                    <span className="min-w-0 truncate">Import</span>
                    <ChevronDown
                      className={cn(
                        "ml-2 h-4 w-4 shrink-0 min-[1200px]:ml-1.5 min-[1200px]:h-3.5 min-[1200px]:w-3.5",
                        isImporting && "opacity-0",
                      )}
                      aria-hidden="true"
                    />
                  </Button>
                  {importMenuOpen ? (
                    <div className="absolute right-0 top-12 z-30 w-[min(16rem,calc(100vw-2rem))] rounded-[12px] bg-white p-2 shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:ring-[#263a55]">
                      <button
                        className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-semibold text-[#111827] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:text-[#98a2b3] disabled:hover:bg-transparent dark:text-foreground dark:hover:bg-white/5 dark:disabled:text-[#64748b] dark:disabled:hover:bg-transparent"
                        disabled={!canSyncAnyIntegration}
                        title={
                          canSyncAnyIntegration
                            ? undefined
                            : "Connect Jira or Google before importing."
                        }
                        onClick={() => {
                          setImportMenuOpen(false);
                          syncAll();
                        }}
                      >
                        Import all
                      </button>
                      <div className="my-1 h-px bg-[#e1e6ef] dark:bg-[#263a55]" />
                      <button
                        className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:text-[#98a2b3] disabled:hover:bg-transparent dark:text-foreground dark:hover:bg-white/5 dark:disabled:text-[#64748b] dark:disabled:hover:bg-transparent"
                        disabled={!canSyncJira}
                        title={
                          canSyncJira
                            ? undefined
                            : "Connect Jira before importing."
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
                            : "Connect Google before importing."
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
                            : "Connect Google before importing."
                        }
                        onClick={() => {
                          setImportMenuOpen(false);
                          sync("google-tasks");
                        }}
                      >
                        Import Google Tasks
                      </button>
                      <button
                        className="group flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:text-[#98a2b3] disabled:hover:bg-transparent dark:text-foreground dark:hover:bg-white/5 dark:disabled:text-[#64748b] dark:disabled:hover:bg-transparent"
                        disabled={!canSyncGoogle}
                        aria-label="Import Gmail with AI"
                        title={
                          canSyncGoogle
                            ? undefined
                            : "Connect Google before importing."
                        }
                        onClick={() => {
                          setImportMenuOpen(false);
                          sync("gmail");
                        }}
                      >
                        <GeminiLogo className="mr-2 h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-110 group-hover:rotate-12" />
                        <span className="min-w-0 truncate">Import Gmail</span>
                        <span
                          aria-hidden="true"
                          className="ml-auto inline-flex h-5 shrink-0 items-center rounded-full bg-[linear-gradient(135deg,#eef2ff,#ecfeff)] px-2 text-[11px] font-semibold uppercase tracking-normal text-[#2563eb] shadow-[0_0_0_1px_rgba(37,99,235,0.16),0_6px_18px_rgba(37,99,235,0.12)] transition-shadow group-hover:shadow-[0_0_0_1px_rgba(37,99,235,0.28),0_8px_24px_rgba(37,99,235,0.2)] dark:bg-[linear-gradient(135deg,rgba(124,58,237,0.24),rgba(6,182,212,0.16))] dark:text-[#93c5fd]"
                        >
                          AI
                        </span>
                      </button>
                      <button
                        className="group flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:text-[#98a2b3] disabled:hover:bg-transparent dark:text-foreground dark:hover:bg-white/5 dark:disabled:text-[#64748b] dark:disabled:hover:bg-transparent"
                        disabled={!canSyncGoogle}
                        aria-label="Import Google Chat with AI"
                        title={
                          canSyncGoogle
                            ? undefined
                            : "Connect Google before importing."
                        }
                        onClick={() => {
                          setImportMenuOpen(false);
                          sync("google-chat");
                        }}
                      >
                        <GeminiLogo className="mr-2 h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-110 group-hover:rotate-12" />
                        <span className="min-w-0 truncate">
                          Import Google Chat
                        </span>
                        <span
                          aria-hidden="true"
                          className="ml-auto inline-flex h-5 shrink-0 items-center rounded-full bg-[linear-gradient(135deg,#eef2ff,#ecfeff)] px-2 text-[11px] font-semibold uppercase tracking-normal text-[#2563eb] shadow-[0_0_0_1px_rgba(37,99,235,0.16),0_6px_18px_rgba(37,99,235,0.12)] transition-shadow group-hover:shadow-[0_0_0_1px_rgba(37,99,235,0.28),0_8px_24px_rgba(37,99,235,0.2)] dark:bg-[linear-gradient(135deg,rgba(124,58,237,0.24),rgba(6,182,212,0.16))] dark:text-[#93c5fd]"
                        >
                          AI
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            {importProgress ? (
              <div className="mt-3 rounded-[8px] bg-[#f8fbff] px-3 py-2 ring-1 ring-[#dbe7ff] dark:bg-blue-400/5 dark:ring-blue-300/15">
                <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-[#344054] dark:text-blue-100">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#2563eb] dark:text-blue-300" />
                  <span className="min-w-0 truncate">
                    {importProgress.message}
                  </span>
                </div>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e6eaf2] dark:bg-[#22334d]"
                  role="progressbar"
                  aria-label={`${syncProviderLabels[importProgress.provider]} import progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={importProgressValue}
                >
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#7c3aed,#2563eb,#06b6d4)] transition-[width] duration-300 ease-out"
                    style={{ width: `${importProgressValue}%` }}
                  />
                </div>
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
              {activities.length === 0 ? (
                <EmptyReferenceState>
                  No activities yet. Add a work item or import from Jira,
                  Calendar, Tasks, Gmail, or Chat.
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
                        "flex min-w-0 flex-col gap-2 rounded-[8px] bg-white px-3 py-2.5 ring-1 ring-[#e1e6ef] transition-[opacity,transform,box-shadow] dark:bg-[#0f1b2a] dark:ring-[#263a55] min-[900px]:grid min-[900px]:min-h-[68px] min-[900px]:grid-cols-[24px_34px_minmax(0,1fr)_auto_minmax(72px,max-content)_28px] min-[900px]:items-center min-[900px]:gap-2.5",
                        activityDragPreviewId === activity.id &&
                          "scale-[0.995] opacity-55",
                      )}
                    >
                      <div className="flex min-w-0 items-start gap-2.5 min-[900px]:contents">
                        <Checkbox
                          className="mt-1 min-[900px]:mt-0"
                          checked={activity.selected}
                          onChange={(event) => {
                            const selected = event.target.checked;

                            if (!selected) {
                              removeSummaryReferencesForActivity(activity.id);
                            }

                            setActivity(activity.id, { selected });
                          }}
                          aria-label={`Include ${activity.title}`}
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
                        <div className="min-w-0 flex-1 min-[900px]:flex-none">
                          <div
                            className={cn(
                              "break-words text-sm font-semibold text-[#111827] dark:text-foreground",
                              !isRenamingActivity && "min-[900px]:truncate",
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
                                onFocus={(event) =>
                                  event.currentTarget.select()
                                }
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
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#667085] dark:text-muted-foreground min-[900px]:flex-nowrap">
                            <span className="shrink-0">
                              {reportActivitySourceLabel(activity.source)}
                            </span>
                            {activity.description ? (
                              <>
                                <span className="text-[#98a2b3]">-</span>
                                <span className="min-w-0 break-words min-[900px]:truncate">
                                  {activity.description}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 pl-[3.875rem] min-[900px]:contents min-[900px]:pl-0">
                        {statusLabel ? (
                          <ReferenceBadge
                            tone={statusTone(activity.status)}
                            className="max-w-full justify-self-start overflow-hidden text-ellipsis px-2.5 py-1 text-xs"
                          >
                            {statusLabel}
                          </ReferenceBadge>
                        ) : (
                          <span
                            className="hidden min-[900px]:block"
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
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-normal text-[#111827] dark:text-foreground">
                Summary
              </h2>
              <button
                type="button"
                className="reference-menu-button h-9 w-9 shrink-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                title="Summarize with AI"
                aria-label="Summarize with AI"
                disabled={isBusy || !canSummarizeWithAi}
                onClick={summarizeWithAi}
              >
                {isSummarizing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GeminiLogo className="h-[18px] w-[18px]" />
                )}
              </button>
            </div>
            <LazySummaryEditor
              ref={setSummaryEditorHandle}
              initialSummary={summaryEditorSeed}
              resetKey={`${date}:${initialReport.id}:${initialReport.updatedAt ?? ""}`}
              activityReferences={activityReferences}
              disabled={isSummarizing}
              loadingLabel="Summarizing with AI..."
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
            className="fixed z-50 w-60 rounded-[12px] bg-white p-2 text-sm shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
            style={{ top: openActivityMenu.top, left: openActivityMenu.left }}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left text-[#334155] transition-colors hover:bg-[#eef4ff] hover:text-[#1d4ed8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:text-foreground dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
              onClick={() => openActivitySource(menuActivity)}
            >
              <ExternalLink className="h-4 w-4" />
              Open source
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left text-[#334155] transition-colors hover:bg-[#eef4ff] hover:text-[#1d4ed8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:text-foreground dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
              onClick={() => startRenamingActivity(menuActivity)}
            >
              <Edit3 className="h-4 w-4" />
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left text-[#334155] transition-colors hover:bg-[#eef4ff] hover:text-[#1d4ed8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:text-foreground dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
              onClick={() => copyActivityTitle(menuActivity)}
            >
              <Copy className="h-4 w-4" />
              Copy title
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left text-[#dc2626] transition-colors hover:bg-[#fef2f2] hover:text-[#b42318] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-300 dark:hover:bg-red-400/10 dark:hover:text-red-200"
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
