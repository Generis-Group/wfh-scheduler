"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { signIn } from "next-auth/react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  PenLine,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useDismissableLayer } from "@/components/ui/use-dismissable-layer";
import {
  EmptyReferenceState,
  ReferenceBadge,
} from "@/components/reports/reference-shell";
import {
  SummaryEditor,
  type SummaryEditorHandle,
  type SummarySnapshot,
} from "@/components/reports/summary-editor";
import { dateOnlyDisplayDate, dateOnlyString } from "@/lib/date-only";
import {
  markServerDataStale,
  refreshStaleServerData,
} from "@/lib/client-cache-invalidation";
import type { OAuthProviderConfig } from "@/lib/oauth-config";
import { ATLASSIAN_OAUTH_SCOPE, GOOGLE_OAUTH_SCOPE } from "@/lib/oauth-scopes";
import {
  extractBlockerLines,
  stripLegacyBlockerPrefixes,
  uniqueLines,
} from "@/lib/summary-format";
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
  blockers: string;
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

const sourceLabels: Record<ActivitySource, string> = {
  JIRA: "Jira",
  GOOGLE_CALENDAR: "Google Calendar",
  GOOGLE_TASKS: "Google Tasks",
  MANUAL: "Manual",
};

const sourceStyles: Record<ActivitySource, string> = {
  JIRA: "bg-[#2563eb]",
  GOOGLE_CALENDAR: "bg-[#facc15]",
  GOOGLE_TASKS: "bg-white border border-[#2563eb] dark:bg-[#0b1523]",
  MANUAL: "bg-white border border-[#2563eb] dark:bg-[#0b1523]",
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

const activityPageSize = 5;
const autoSaveDelayMs = 600;
type BusyAction = "submit" | "delete";
type AutoSaveStatus = "saved" | "error";
type SyncProviderKey = keyof typeof syncProviderLabels;
const syncProviderSources: Record<SyncProviderKey, ActivitySource> = {
  jira: "JIRA",
  "google-calendar": "GOOGLE_CALENDAR",
  "google-tasks": "GOOGLE_TASKS",
};

type ReportPayload = {
  summary: string;
  blockers: string;
  workLocation: WorkLocation;
  activityUpdates: Array<{
    id: string;
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

function formatReportDate(value: string | Date) {
  const date = dateOnlyDisplayDate(value);
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const lookup = Object.fromEntries(
    formatted.map((part) => [part.type, part.value]),
  );

  return `${lookup.month} ${lookup.day}, ${lookup.year} (${lookup.weekday})`;
}

function formatDuration(minutes?: number | null) {
  if (!minutes) {
    return "-";
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (!hours) {
    return `${remaining}m`;
  }

  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

async function responseErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body && typeof body.error === "string" ? body.error : fallback;
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

function sourceIcon(source: ActivitySource) {
  if (source === "GOOGLE_CALENDAR") {
    return <CalendarDays className="h-3.5 w-3.5 text-[#2563eb]" />;
  }

  if (source === "GOOGLE_TASKS") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-[#2563eb]" />;
  }

  if (source === "MANUAL") {
    return <PenLine className="h-3.5 w-3.5 text-[#2563eb]" />;
  }

  return <div className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-white" />;
}

function editorSummaryForReport(report: Report) {
  return stripLegacyBlockerPrefixes(report.summary);
}

function blockersForReport(report: Report) {
  return uniqueLines(
    [report.blockers, extractBlockerLines(report.summary)]
      .filter(Boolean)
      .join("\n"),
  );
}

function isNewManualActivity(activity: Activity) {
  return activity.id.startsWith("manual-new-");
}

function buildReportPayload(
  summary: string,
  blockers: string,
  workLocation: WorkLocation,
  activities: Activity[],
  deletedActivityIds: string[],
): ReportPayload {
  return {
    summary,
    blockers,
    workLocation,
    activityUpdates: activities
      .filter((activity) => !isNewManualActivity(activity))
      .map((activity) => ({
        id: activity.id,
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
    payload.blockers.trim() ||
    payload.workLocation !== "UNKNOWN" ||
    payload.activityUpdates.length > 0 ||
    payload.deletedActivityIds.length > 0 ||
    payload.manualActivities.length > 0,
  );
}

export function DailyReportApp({
  initialReport,
  date,
  integrationStatus = { google: false, atlassian: false },
  oauthConfig = { google: true, atlassian: true },
}: {
  initialReport: Report;
  date: string;
  integrationStatus?: IntegrationStatus;
  oauthConfig?: OAuthProviderConfig;
}) {
  const router = useRouter();
  const reportDate = dateInputValue(date);
  const initialSummary = editorSummaryForReport(initialReport);
  const initialBlockers = blockersForReport(initialReport);
  const initialPayload = buildReportPayload(
    initialSummary,
    initialBlockers,
    initialReport.workLocation,
    initialReport.activities,
    [],
  );
  const [report, setReport] = useState(initialReport);
  const [summary, setSummary] = useState(() => initialSummary);
  const [blockers, setBlockers] = useState(() => initialBlockers);
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
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("saved");
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [importingProvider, setImportingProvider] =
    useState<SyncProviderKey | null>(null);
  const [activityPage, setActivityPage] = useState(1);
  const [activitySearch, setActivitySearch] = useState("");
  const summaryEditorRef = useRef<SummaryEditorHandle>(null);
  const importMenuRef = useRef<HTMLDivElement | null>(null);
  const activityMenuRef = useRef<HTMLDivElement | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef<Promise<Report | null> | null>(null);
  const saveGenerationRef = useRef(0);
  const reportRef = useRef(initialReport);
  const latestDraftRef = useRef<AutoDraftSnapshot | null>(null);
  const flushAutoDraftSaveRef = useRef<() => Promise<Report | null>>(
    async () => null,
  );
  const lastSavedSignatureRef = useRef(
    draftPayloadSignature(reportDate, initialPayload),
  );

  useDismissableLayer({
    open: importMenuOpen,
    refs: [importMenuRef],
    onDismiss: () => setImportMenuOpen(false),
  });

  useDismissableLayer({
    open: Boolean(openActivityMenu),
    refs: [activityMenuRef],
    onDismiss: () => setOpenActivityMenu(null),
  });

  useEffect(() => {
    const nextSummary = editorSummaryForReport(initialReport);
    const nextBlockers = blockersForReport(initialReport);
    const nextPayload = buildReportPayload(
      nextSummary,
      nextBlockers,
      initialReport.workLocation,
      initialReport.activities,
      [],
    );

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    saveGenerationRef.current += 1;
    saveInFlightRef.current = null;
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
    setBlockers(nextBlockers);
    setWorkLocation(initialReport.workLocation);
    setActivities(initialReport.activities);
    setDeletedActivityIds([]);
    setOpenActivityMenu(null);
    setImportMenuOpen(false);
    setMessage(null);
    setAutoSaveStatus("saved");
    setActivityPage(1);
    setActivitySearch("");
  }, [initialReport, date, reportDate]);

  function setActivity(id: string, patch: Partial<Activity>) {
    setActivities((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function handleSummaryChange(snapshot: SummarySnapshot) {
    setSummary(snapshot.summary);
    setBlockers(snapshot.blockers);
  }

  function removeActivity(activity: Activity) {
    if (activity.source !== "MANUAL") {
      setActivity(activity.id, { selected: false });
      setOpenActivityMenu(null);
      return;
    }

    setActivities((items) => items.filter((item) => item.id !== activity.id));
    if (!isNewManualActivity(activity)) {
      setDeletedActivityIds((current) => [
        ...new Set([...current, activity.id]),
      ]);
    }
    setOpenActivityMenu(null);
  }

  function toggleActivityMenu(
    activityId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    if (openActivityMenu?.id === activityId) {
      setOpenActivityMenu(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 240;
    const menuHeight = 204;
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
    setOpenActivityMenu({ id: activityId, top, left });
  }

  useEffect(() => {
    if (!openActivityMenu) {
      return;
    }

    function closeMenu() {
      setOpenActivityMenu(null);
    }

    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [openActivityMenu]);

  function clearAutoDraftTimer() {
    if (!autoSaveTimerRef.current) {
      return;
    }

    window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
  }

  function shouldAutoSaveSnapshot(snapshot: AutoDraftSnapshot) {
    if (snapshot.signature === lastSavedSignatureRef.current) {
      return false;
    }

    return Boolean(
      snapshot.reportId ||
      reportRef.current.id ||
      snapshot.hasMeaningfulContent,
    );
  }

  function captureCurrentDraftSnapshot() {
    const editorSnapshot = summaryEditorRef.current?.getSnapshot();
    const currentSummary = editorSnapshot?.summary ?? summary;
    const currentBlockers = editorSnapshot?.blockers ?? blockers;
    const payload = buildReportPayload(
      currentSummary,
      currentBlockers,
      workLocation,
      activities,
      deletedActivityIds,
    );
    const signature = draftPayloadSignature(reportDate, payload);
    const snapshot: AutoDraftSnapshot = {
      reportId: reportRef.current.id,
      reportDate,
      payload,
      signature,
      hasMeaningfulContent: hasMeaningfulDraftPayload(payload),
    };

    if (
      editorSnapshot &&
      (currentSummary !== summary || currentBlockers !== blockers)
    ) {
      setSummary(currentSummary);
      setBlockers(currentBlockers);
    }

    latestDraftRef.current = snapshot;
    return snapshot;
  }

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
    const nextBlockers = blockersForReport(nextReport);
    const nextPayload = buildReportPayload(
      nextSummary,
      nextBlockers,
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
    setBlockers(nextBlockers);
    setActivities(nextReport.activities);
    setDeletedActivityIds([]);
    setWorkLocation(nextReport.workLocation);
    summaryEditorRef.current?.setSnapshot({
      summary: nextSummary,
      blockers: nextBlockers,
    });
  }

  function startAutoDraftSave(
    snapshot: AutoDraftSnapshot,
    forceCreate = false,
  ) {
    if (!forceCreate && !shouldAutoSaveSnapshot(snapshot)) {
      return Promise.resolve(reportRef.current.id ? reportRef.current : null);
    }

    const reportId = snapshot.reportId || reportRef.current.id;
    const generation = saveGenerationRef.current;
    const savedSignature = snapshot.signature;
    const request = (async (): Promise<Report | null> => {
      try {
        const response = await fetch(
          reportId ? `/api/reports/${reportId}` : "/api/reports",
          {
            method: reportId ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              reportId
                ? snapshot.payload
                : { ...snapshot.payload, date: snapshot.reportDate },
            ),
          },
        );

        if (!response.ok) {
          throw new Error(
            await responseErrorMessage(response, "Unable to save report."),
          );
        }

        const data = await response.json();
        const nextReport = data.report as Report;

        if (generation !== saveGenerationRef.current) {
          return nextReport;
        }

        applySavedReport(nextReport, false, savedSignature);
        markServerDataStale();
        setAutoSaveStatus("saved");

        return nextReport;
      } catch {
        if (generation === saveGenerationRef.current) {
          setAutoSaveStatus("error");
        }

        return null;
      }
    })();

    saveInFlightRef.current = request;
    request.finally(() => {
      if (saveInFlightRef.current === request) {
        saveInFlightRef.current = null;
      }
    });

    return request;
  }

  async function flushAutoDraftSave(options: { forceCreate?: boolean } = {}) {
    clearAutoDraftTimer();
    captureCurrentDraftSnapshot();

    let forceCreate = options.forceCreate ?? false;
    let savedReport: Report | null = reportRef.current.id
      ? reportRef.current
      : null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (saveInFlightRef.current) {
        savedReport = await saveInFlightRef.current;
      }

      const snapshot = latestDraftRef.current;
      if (!snapshot) {
        return savedReport;
      }

      if (!forceCreate && !shouldAutoSaveSnapshot(snapshot)) {
        return savedReport;
      }

      savedReport = await startAutoDraftSave(snapshot, forceCreate);
      forceCreate = false;

      if (!savedReport) {
        return null;
      }

      const nextSnapshot = latestDraftRef.current;
      if (!nextSnapshot || !shouldAutoSaveSnapshot(nextSnapshot)) {
        return savedReport;
      }
    }

    scheduleAutoDraftSave();
    return savedReport;
  }

  function scheduleAutoDraftSave() {
    clearAutoDraftTimer();
    autoSaveTimerRef.current = window.setTimeout(() => {
      void flushAutoDraftSaveRef.current();
    }, autoSaveDelayMs);
  }

  async function submitReport() {
    if (busyAction || importingProvider) {
      return;
    }

    const wasPublished = reportRef.current.status === "SUBMITTED";
    setBusyAction("submit");
    setMessage(null);

    const saved = await flushAutoDraftSave({
      forceCreate: !reportRef.current.id,
    });

    if (!saved?.id) {
      setMessage("Save failed. Try again before submitting.");
      setBusyAction(null);
      return;
    }

    const submitResponse = await fetch(`/api/reports/${saved.id}/submit`, {
      method: "POST",
    });

    if (!submitResponse.ok) {
      setMessage(
        (await submitResponse.json()).error ?? "Unable to submit report.",
      );
      setBusyAction(null);
      return;
    }

    const nextReport = (await submitResponse.json()).report as Report;
    applySavedReport(
      nextReport,
      true,
      draftPayloadSignature(
        reportDate,
        buildReportPayload(
          summary,
          blockers,
          workLocation,
          activities,
          deletedActivityIds,
        ),
      ),
    );
    markServerDataStale();
    setAutoSaveStatus("saved");
    setMessage(
      wasPublished ? "Resubmitted for review." : "Submitted for review.",
    );
    setBusyAction(null);
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

    setBusyAction("delete");
    setMessage(null);
    clearAutoDraftTimer();
    saveGenerationRef.current += 1;
    saveInFlightRef.current = null;

    const response = await fetch(`/api/reports/${report.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setMessage((await response.json()).error ?? "Unable to delete draft.");
      setBusyAction(null);
      return;
    }

    const clearedReport: Report = {
      ...reportRef.current,
      id: "",
      summary: "",
      blockers: "",
      workLocation: "UNKNOWN" as WorkLocation,
      status: "DRAFT",
      activities: [],
      submittedAt: null,
      updatedAt: null,
    };
    const clearedPayload = buildReportPayload("", "", "UNKNOWN", [], []);

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
    setBlockers("");
    setWorkLocation("UNKNOWN");
    setActivities([]);
    setDeletedActivityIds([]);
    summaryEditorRef.current?.setSnapshot({ summary: "", blockers: "" });
    markServerDataStale();
    setAutoSaveStatus("saved");
    setMessage("Draft deleted.");
    setBusyAction(null);
  }

  async function sync(provider: SyncProviderKey) {
    if (busyAction || importingProvider) {
      return;
    }

    const providerLabel = syncProviderLabels[provider];
    setImportingProvider(provider);
    setMessage(null);

    try {
      const response = await fetch(`/api/sync/${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });

      if (!response.ok) {
        setMessage(
          await responseErrorMessage(
            response,
            `${providerLabel} import failed.`,
          ),
        );
        return;
      }

      const result = (await response.json()) as {
        importedCount: number;
        skippedCount: number;
        staleCount?: number;
        activities?: Activity[];
      };
      setActivities((current) =>
        mergeSyncedActivities(
          current,
          syncProviderSources[provider],
          result.activities ?? [],
        ),
      );
      setActivityPage(1);
      markServerDataStale();

      setMessage(
        result.importedCount > 0
          ? `${providerLabel} import complete: ${result.importedCount} work item${result.importedCount === 1 ? "" : "s"} found${result.staleCount ? `, ${result.staleCount} stale item${result.staleCount === 1 ? "" : "s"} hidden` : ""}.`
          : `No ${providerLabel.toLowerCase()} work items found for this date.`,
      );
    } catch {
      setMessage(
        `${providerLabel} import failed. Check your connection and try again.`,
      );
    } finally {
      setImportingProvider(null);
    }
  }

  function connectProvider(provider: "google" | "atlassian") {
    signIn(
      provider,
      { callbackUrl: "/" },
      provider === "google"
        ? {
            access_type: "offline",
            prompt: "consent select_account",
            scope: GOOGLE_OAUTH_SCOPE,
          }
        : {
            audience: "api.atlassian.com",
            prompt: "consent",
            scope: ATLASSIAN_OAUTH_SCOPE,
          },
    );
  }

  async function copyActivityTitle(activity: Activity) {
    await navigator.clipboard?.writeText(activity.title);
    setOpenActivityMenu(null);
    setMessage("Activity title copied.");
  }

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
  const isSubmitting = busyAction === "submit";
  const isDeleting = busyAction === "delete";
  const isImporting = importingProvider !== null;
  const isPublishedReport = report.status === "SUBMITTED";
  const submitButtonText = isPublishedReport
    ? "Resubmit update"
    : "Submit update";
  const submitProgressText = isPublishedReport
    ? "Resubmitting..."
    : "Submitting...";
  const statusIndicatorLabel = isPublishedReport ? "Published" : "Draft";
  const StatusIndicatorIcon = isPublishedReport ? CheckCircle2 : PenLine;
  const importStatusLabel = importingProvider
    ? `Importing ${syncProviderLabels[importingProvider].toLowerCase()}...`
    : "Import";
  const isBusy = busyAction !== null || isImporting;
  const selectedCount = activities.filter(
    (activity) => activity.selected,
  ).length;
  const currentPayload = buildReportPayload(
    summary,
    blockers,
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
  flushAutoDraftSaveRef.current = flushAutoDraftSave;
  const normalizedActivitySearch = activitySearch.trim().toLowerCase();
  const filteredActivities = normalizedActivitySearch
    ? activities.filter((activity) =>
        [
          activity.title,
          activity.description,
          activity.status,
          sourceLabels[activity.source],
          formatDuration(activity.durationMinutes),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedActivitySearch),
      )
    : activities;
  const filteredSelectedCount = filteredActivities.filter(
    (activity) => activity.selected,
  ).length;
  const activityPageCount = Math.max(
    1,
    Math.ceil(filteredActivities.length / activityPageSize),
  );
  const currentActivityPage = Math.min(activityPage, activityPageCount);
  const activityPageStart =
    filteredActivities.length === 0
      ? 0
      : (currentActivityPage - 1) * activityPageSize + 1;
  const activityPageEnd = Math.min(
    currentActivityPage * activityPageSize,
    filteredActivities.length,
  );
  const pagedActivities = filteredActivities.slice(
    (currentActivityPage - 1) * activityPageSize,
    currentActivityPage * activityPageSize,
  );

  useEffect(() => {
    const pageCount = Math.max(
      1,
      Math.ceil(filteredActivities.length / activityPageSize),
    );

    setActivityPage((current) => Math.min(current, pageCount));
  }, [filteredActivities.length]);

  useEffect(() => {
    const snapshot = latestDraftRef.current;

    if (!snapshot || !shouldAutoSaveSnapshot(snapshot)) {
      clearAutoDraftTimer();
      return;
    }

    clearAutoDraftTimer();
    autoSaveTimerRef.current = window.setTimeout(() => {
      void flushAutoDraftSaveRef.current();
    }, autoSaveDelayMs);

    return () => {
      clearAutoDraftTimer();
    };
  }, [currentDraftSignature, report.id, report.status]);

  async function goToReportDate(nextDate: string) {
    if (!nextDate) {
      return;
    }

    if (nextDate === reportDate) {
      refreshStaleServerData(router);
      router.push(`/?date=${nextDate}`);
      return;
    }

    if (busyAction || importingProvider) {
      return;
    }

    const snapshot = latestDraftRef.current;
    const needsSave = snapshot ? shouldAutoSaveSnapshot(snapshot) : false;
    const saved = await flushAutoDraftSave();

    if (needsSave && !saved) {
      setMessage("Save failed. Stay on this date and try again.");
      return;
    }

    refreshStaleServerData(router);
    router.push(`/?date=${nextDate}`);
  }

  const menuActivity = openActivityMenu
    ? activities.find((activity) => activity.id === openActivityMenu.id)
    : null;

  return (
    <>
      <main className="reference-page">
        <div className="mb-3 flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
          <div>
            <h1 className="text-[24px] font-semibold leading-tight tracking-normal text-[#111827] dark:text-foreground">
              Daily Update
            </h1>
            <p className="mt-0.5 text-sm text-[#667085] dark:text-muted-foreground">
              Share what you worked on today.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {report.id && report.status === "DRAFT" ? (
              <Button
                variant="outline"
                className="h-10 rounded-[8px] bg-white px-4 text-sm font-medium text-[#b42318] shadow-none ring-1 ring-[#f3b8b2] hover:bg-[#fff5f5] dark:bg-[#101d2e] dark:text-red-300 dark:ring-red-400/25 dark:hover:bg-red-400/10"
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
              className="h-10 rounded-[8px] bg-[#2563eb] px-5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.2)] hover:bg-[#1d4ed8]"
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
          </div>
        </div>

        <section className="mb-3 rounded-[8px] bg-white p-3 shadow-[0_6px_18px_rgba(15,23,42,0.045)] ring-1 ring-[#e6ebf3] dark:bg-[#0f1b2a] dark:ring-[#1d2d43]">
          <div className="grid gap-2 min-[900px]:grid-cols-[minmax(320px,430px)_minmax(180px,220px)_minmax(190px,240px)] min-[900px]:items-center min-[900px]:justify-between">
            <label className="relative flex h-10 min-w-0 cursor-pointer items-center gap-2.5 rounded-[7px] bg-white px-4 text-sm font-medium text-[#111827] shadow-none ring-1 ring-[#dfe4ee] dark:bg-[#101d2e] dark:text-foreground dark:ring-[#263a55]">
              <CalendarDays className="h-4 w-4 shrink-0 text-[#475467] dark:text-muted-foreground" />
              <span className="truncate">{formatReportDate(date)}</span>
              <Input
                type="date"
                value={reportDate}
                onChange={(event) => void goToReportDate(event.target.value)}
                className="absolute inset-0 h-full cursor-pointer border-0 bg-transparent opacity-0"
                aria-label="Select report date"
              />
            </label>

            <label className="flex min-h-10 w-full items-center gap-3 rounded-[7px] bg-white px-3 text-sm shadow-none ring-1 ring-[#dfe4ee] dark:bg-[#101d2e] dark:ring-[#263a55]">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[#667085] dark:text-muted-foreground">
                Location
              </span>
              <Select
                value={workLocation}
                onChange={(event) =>
                  setWorkLocation(event.target.value as WorkLocation)
                }
                className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-sm font-semibold text-[#111827] shadow-none focus-visible:ring-0 dark:bg-transparent dark:text-foreground"
                aria-label="Work location"
              >
                {workLocationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>

            <div
              className="flex min-h-10 w-full items-center gap-4 rounded-[7px] bg-white px-3 text-sm shadow-none ring-1 ring-[#dfe4ee] dark:bg-[#101d2e] dark:ring-[#263a55]"
              aria-live="polite"
            >
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[#667085] dark:text-muted-foreground">
                Status
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-medium",
                  isPublishedReport
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                    : "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
                )}
              >
                <StatusIndicatorIcon className="h-4 w-4" />
                {statusIndicatorLabel}
              </span>
              {autoSaveStatus === "error" ? (
                <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                  Save failed
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <div className="grid gap-3 min-[1200px]:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)] min-[1500px]:grid-cols-[minmax(0,1.18fr)_minmax(480px,0.82fr)]">
          <section className="flex min-h-[560px] flex-col rounded-[8px] bg-white p-3 shadow-[0_6px_18px_rgba(15,23,42,0.045)] ring-1 ring-[#e6ebf3] dark:bg-[#101d2e] dark:ring-[#263a55]">
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
                    {selectedCount} selected
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
                  {importStatusLabel}
                  {!isImporting ? (
                    <ChevronDown className="ml-2 h-4 w-4" />
                  ) : null}
                </Button>
                {importMenuOpen ? (
                  <div className="absolute right-0 top-12 z-30 w-64 rounded-[12px] bg-white p-2 shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:ring-[#263a55]">
                    <button
                      className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
                      disabled={!canSyncJira && !oauthConfig.atlassian}
                      onClick={() => {
                        setImportMenuOpen(false);
                        canSyncJira
                          ? sync("jira")
                          : connectProvider("atlassian");
                      }}
                    >
                      {canSyncJira ? "Import Jira" : "Connect Jira"}
                    </button>
                    <button
                      className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
                      disabled={!canSyncGoogle && !oauthConfig.google}
                      onClick={() => {
                        setImportMenuOpen(false);
                        canSyncGoogle
                          ? sync("google-calendar")
                          : connectProvider("google");
                      }}
                    >
                      {canSyncGoogle ? "Import Calendar" : "Connect Google"}
                    </button>
                    <button
                      className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
                      disabled={!canSyncGoogle && !oauthConfig.google}
                      onClick={() => {
                        setImportMenuOpen(false);
                        canSyncGoogle
                          ? sync("google-tasks")
                          : connectProvider("google");
                      }}
                    >
                      {canSyncGoogle ? "Import Tasks" : "Connect Google Tasks"}
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

            <label className="relative mt-3 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
              <Input
                value={activitySearch}
                onChange={(event) => {
                  setActivitySearch(event.target.value);
                  setActivityPage(1);
                }}
                placeholder="Search work items"
                className="h-9 rounded-[7px] bg-white pl-9 text-sm shadow-none ring-1 ring-[#dfe4ee] focus-visible:ring-2 dark:bg-[#0f1b2a] dark:ring-[#263a55]"
                aria-label="Search work items"
              />
            </label>

            <div className="mt-3 h-[390px] space-y-2 overflow-y-auto pr-1">
              {activities.length === 0 ? (
                <EmptyReferenceState>
                  No activities yet. Import work from Jira, Calendar, or Tasks.
                </EmptyReferenceState>
              ) : pagedActivities.length === 0 ? (
                <EmptyReferenceState>
                  No work items match your search.
                </EmptyReferenceState>
              ) : (
                pagedActivities.map((activity) => (
                  <article
                    key={activity.id}
                    className="grid min-h-[68px] grid-cols-[24px_34px_minmax(0,1fr)_auto_58px_28px] items-center gap-2.5 rounded-[8px] bg-white px-3 py-2.5 ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
                  >
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-[#cbd5e1] accent-[#4f46e5]"
                      checked={activity.selected}
                      onChange={(event) =>
                        setActivity(activity.id, {
                          selected: event.target.checked,
                        })
                      }
                      aria-label={`Include ${activity.title}`}
                    />
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-[7px]",
                        sourceStyles[activity.source],
                      )}
                    >
                      {sourceIcon(activity.source)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#111827] dark:text-foreground">
                        {activity.sourceUrl && activity.sourceUrl !== "#" ? (
                          <a
                            href={activity.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-[#2563eb]"
                          >
                            {activity.title || "Untitled activity"}
                          </a>
                        ) : (
                          activity.title || "Untitled activity"
                        )}
                      </div>
                      <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-[#667085] dark:text-muted-foreground">
                        <span className="shrink-0">
                          {sourceLabels[activity.source]}
                        </span>
                        {activity.description ? (
                          <>
                            <span className="text-[#98a2b3]">•</span>
                            <span className="truncate">
                              {activity.description}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <ReferenceBadge
                      tone={statusTone(activity.status)}
                      className="justify-self-start px-2.5 py-1 text-xs"
                    >
                      {activity.status || "Not set"}
                    </ReferenceBadge>
                    <div className="text-sm font-medium text-[#111827] dark:text-foreground">
                      {formatDuration(activity.durationMinutes)}
                    </div>
                    <button
                      className="reference-menu-button"
                      aria-label={`More actions for ${activity.title}`}
                      onClick={(event) =>
                        toggleActivityMenu(activity.id, event)
                      }
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </article>
                ))
              )}
            </div>

            <div className="mt-auto border-t border-[#e6eaf2] pt-3 dark:border-[#263a55]">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#667085] dark:text-muted-foreground">
                <span>
                  {selectedCount} of {activities.length} items selected
                  {activities.length > 0
                    ? normalizedActivitySearch
                      ? `, showing ${activityPageStart}-${activityPageEnd} of ${filteredActivities.length} matches (${filteredSelectedCount} selected)`
                      : `, showing ${activityPageStart}-${activityPageEnd}`
                    : ""}
                </span>
              </div>
              <div className="mt-3 flex min-h-8 justify-end">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 rounded-[7px] bg-white p-0 dark:bg-[#0f1b2a]"
                    aria-label="Previous work items page"
                    disabled={
                      currentActivityPage === 1 ||
                      filteredActivities.length === 0
                    }
                    onClick={() =>
                      setActivityPage((page) => Math.max(1, page - 1))
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-20 text-center text-xs font-medium text-[#667085] dark:text-muted-foreground">
                    Page {currentActivityPage} of {activityPageCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 rounded-[7px] bg-white p-0 dark:bg-[#0f1b2a]"
                    aria-label="Next work items page"
                    disabled={
                      currentActivityPage === activityPageCount ||
                      filteredActivities.length === 0
                    }
                    onClick={() =>
                      setActivityPage((page) =>
                        Math.min(activityPageCount, page + 1),
                      )
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <aside className="min-h-[560px] rounded-[8px] bg-white p-3 shadow-[0_6px_18px_rgba(15,23,42,0.045)] ring-1 ring-[#e6ebf3] dark:bg-[#101d2e] dark:ring-[#263a55]">
            <div>
              <h2 className="text-lg font-semibold tracking-normal text-[#111827] dark:text-foreground">
                Summary
              </h2>
            </div>
            <SummaryEditor
              ref={summaryEditorRef}
              initialSummary={editorSummaryForReport(initialReport)}
              initialBlockers={blockersForReport(initialReport)}
              resetKey={`${date}:${initialReport.id}:${initialReport.updatedAt ?? ""}`}
              onChange={handleSummaryChange}
            />
          </aside>
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
              className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[#334155] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
              onClick={() => openActivitySource(menuActivity)}
            >
              <ExternalLink className="h-4 w-4" />
              Open source
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[#334155] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
              onClick={() => {
                setActivity(menuActivity.id, {
                  selected: !menuActivity.selected,
                });
                setOpenActivityMenu(null);
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              {menuActivity.selected ? "Exclude" : "Include"}
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[#334155] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
              onClick={() => {
                setActivity(menuActivity.id, { employeeNote: "" });
                setOpenActivityMenu(null);
              }}
            >
              <Edit3 className="h-4 w-4" />
              Clear note
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[#334155] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
              onClick={() => copyActivityTitle(menuActivity)}
            >
              <Copy className="h-4 w-4" />
              Copy title
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[#dc2626] hover:bg-[#fef2f2] dark:hover:bg-red-400/10"
              onClick={() => removeActivity(menuActivity)}
            >
              <Trash2 className="h-4 w-4" />
              {menuActivity.source === "MANUAL"
                ? "Delete item"
                : "Remove from report"}
            </button>
          </div>
        </>
      ) : null}
      {message ? (
        <div
          className="fixed bottom-5 right-5 z-50 flex max-w-[min(420px,calc(100vw-2.5rem))] items-start gap-3 rounded-[12px] bg-white px-4 py-3 text-sm font-medium text-[#334155] shadow-[0_18px_42px_rgba(15,23,42,0.18)] ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:text-[#d7e0ec] dark:ring-[#263a55]"
          role="status"
          aria-live="polite"
        >
          <span className="min-w-0 flex-1">{message}</span>
          <button
            type="button"
            className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[#64748b] transition-colors hover:bg-[#eef2f7] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground"
            aria-label="Dismiss message"
            onClick={() => setMessage(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </>
  );
}
