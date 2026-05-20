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
  Save,
  Search,
  Send,
  Trash2,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyReferenceState, ReferenceAppShell, ReferenceBadge } from "@/components/reports/reference-shell";
import { SummaryEditor, type SummaryEditorHandle, type SummarySnapshot } from "@/components/reports/summary-editor";
import { dateOnlyDisplayDate, dateOnlyString } from "@/lib/date-only";
import type { OAuthProviderConfig } from "@/lib/oauth-config";
import { ATLASSIAN_OAUTH_SCOPE, GOOGLE_OAUTH_SCOPE } from "@/lib/oauth-scopes";
import { extractBlockerLines, stripLegacyBlockerPrefixes, uniqueLines } from "@/lib/summary-format";
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
  workLocation: "OFFICE" | "WFH" | "HYBRID" | "PTO" | "OUT_OF_OFFICE" | "UNKNOWN";
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
  MANUAL: "Manual"
};

const sourceStyles: Record<ActivitySource, string> = {
  JIRA: "bg-[#2563eb]",
  GOOGLE_CALENDAR: "bg-[#facc15]",
  GOOGLE_TASKS: "bg-white border border-[#2563eb] dark:bg-[#0b1523]",
  MANUAL: "bg-white border border-[#2563eb] dark:bg-[#0b1523]"
};

const syncProviderLabels = {
  jira: "Jira",
  "google-calendar": "Calendar",
  "google-tasks": "Tasks"
} as const;

const workLocationOptions: Array<{ value: WorkLocation; label: string }> = [
  { value: "UNKNOWN", label: "Unspecified" },
  { value: "OFFICE", label: "Office" },
  { value: "WFH", label: "WFH" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "PTO", label: "PTO" },
  { value: "OUT_OF_OFFICE", label: "Out of office" }
];

const activityPageSize = 5;
type BusyAction = "save" | "submit" | "delete";
type SyncProviderKey = keyof typeof syncProviderLabels;
const syncProviderSources: Record<SyncProviderKey, ActivitySource> = {
  jira: "JIRA",
  "google-calendar": "GOOGLE_CALENDAR",
  "google-tasks": "GOOGLE_TASKS"
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
    const startedDelta = activityStartedSortValue(first) - activityStartedSortValue(second);

    if (startedDelta !== 0) {
      return startedDelta;
    }

    return first.title.localeCompare(second.title) || first.id.localeCompare(second.id);
  });
}

function mergeSyncedActivities(current: Activity[], source: ActivitySource, synced: Activity[]) {
  return sortActivitiesForDisplay([...current.filter((activity) => activity.source !== source), ...synced]);
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
    weekday: "short"
  }).formatToParts(date);
  const lookup = Object.fromEntries(formatted.map((part) => [part.type, part.value]));

  return `${lookup.month} ${lookup.day}, ${lookup.year} (${lookup.weekday})`;
}

function formatTimestamp(value?: string | Date | null) {
  const date = toDate(value);

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
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

function statusTone(status?: string | null): "green" | "orange" | "blue" | "neutral" {
  const normalized = status?.toLowerCase() ?? "";

  if (normalized.includes("done") || normalized.includes("complete") || normalized.includes("submitted")) {
    return "green";
  }

  if (normalized.includes("progress")) {
    return "blue";
  }

  if (normalized.includes("late") || normalized.includes("todo") || normalized.includes("draft")) {
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

function sameActivityState(left: Activity[], right: Activity[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((activity, index) => {
    const other = right[index];
    return Boolean(
      other &&
        activity.id === other.id &&
        activity.selected === other.selected &&
        (activity.employeeNote ?? "") === (other.employeeNote ?? "")
    );
  });
}

function editorSummaryForReport(report: Report) {
  return stripLegacyBlockerPrefixes(report.summary);
}

function blockersForReport(report: Report) {
  return uniqueLines([report.blockers, extractBlockerLines(report.summary)].filter(Boolean).join("\n"));
}

export function DailyReportApp({
  initialReport,
  date,
  userName,
  userEmail,
  userRole,
  userStatus,
  timezone,
  mustChangePassword,
  integrationStatus = { google: false, atlassian: false },
  oauthConfig = { google: true, atlassian: true }
}: {
  initialReport: Report;
  date: string;
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  userStatus?: string | null;
  timezone?: string | null;
  mustChangePassword?: boolean;
  integrationStatus?: IntegrationStatus;
  oauthConfig?: OAuthProviderConfig;
}) {
  const router = useRouter();
  const [report, setReport] = useState(initialReport);
  const [summary, setSummary] = useState(() => editorSummaryForReport(initialReport));
  const [blockers, setBlockers] = useState(() => blockersForReport(initialReport));
  const [workLocation, setWorkLocation] = useState<WorkLocation>(initialReport.workLocation);
  const [activities, setActivities] = useState(initialReport.activities);
  const [deletedActivityIds, setDeletedActivityIds] = useState<string[]>([]);
  const [openActivityMenu, setOpenActivityMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [importingProvider, setImportingProvider] = useState<SyncProviderKey | null>(null);
  const [activityPage, setActivityPage] = useState(1);
  const [activitySearch, setActivitySearch] = useState("");
  const summaryEditorRef = useRef<SummaryEditorHandle>(null);

  const reportDate = dateInputValue(date);

  useEffect(() => {
    setReport(initialReport);
    setSummary(editorSummaryForReport(initialReport));
    setBlockers(blockersForReport(initialReport));
    setWorkLocation(initialReport.workLocation);
    setActivities(initialReport.activities);
    setDeletedActivityIds([]);
    setOpenActivityMenu(null);
    setImportMenuOpen(false);
    setMessage(null);
    setActivityPage(1);
    setActivitySearch("");
  }, [initialReport, date]);

  function setActivity(id: string, patch: Partial<Activity>) {
    setActivities((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function handleSummaryChange(snapshot: SummarySnapshot) {
    setSummary(snapshot.summary);
    setBlockers(snapshot.blockers);
  }

  function removeActivity(activity: Activity) {
    if (activity.source !== "MANUAL") {
      setActivity(activity.id, { selected: false });
      setOpenActivityMenu(null);
      setMessage("Work item removed from this report. Save the draft to keep this change.");
      return;
    }

    setActivities((items) => items.filter((item) => item.id !== activity.id));
    if (!activity.id.startsWith("manual-new-")) {
      setDeletedActivityIds((current) => [...new Set([...current, activity.id])]);
    }
    setOpenActivityMenu(null);
    setMessage("Manual work item deleted. Save the draft to keep this change.");
  }

  function toggleActivityMenu(activityId: string, event: MouseEvent<HTMLButtonElement>) {
    if (openActivityMenu?.id === activityId) {
      setOpenActivityMenu(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 240;
    const menuHeight = 204;
    const gap = 8;
    const top = Math.min(window.innerHeight - menuHeight - 12, Math.max(12, rect.bottom + gap));
    const left = Math.min(window.innerWidth - menuWidth - 12, Math.max(12, rect.right - menuWidth));

    setOpenActivityMenu({ id: activityId, top, left });
  }

  useEffect(() => {
    if (!openActivityMenu) {
      return;
    }

    function closeMenu() {
      setOpenActivityMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [openActivityMenu]);

  async function saveReport(submit = false) {
    if (busyAction || importingProvider) {
      return;
    }

    setBusyAction(submit ? "submit" : "save");
    setMessage(null);
    const editorSnapshot = summaryEditorRef.current?.getSnapshot();
    const payloadSummary = editorSnapshot?.summary ?? summary;
    const payloadBlockers = editorSnapshot?.blockers ?? blockers;

    if (editorSnapshot) {
      setSummary(editorSnapshot.summary);
      setBlockers(editorSnapshot.blockers);
    }

    const manualActivities = activities
      .filter((activity) => activity.id.startsWith("manual-new-"))
      .map((activity) => ({
        title: activity.title,
        employeeNote: activity.employeeNote ?? null,
        status: activity.status,
        durationMinutes: activity.durationMinutes ?? null
      }));

    const reportPayload = {
      summary: payloadSummary,
      blockers: payloadBlockers,
      workLocation,
      activityUpdates: activities
        .map((activity) => ({
          id: activity.id,
          selected: activity.selected,
          employeeNote: activity.employeeNote ?? null
        }))
        .filter((activity) => !activity.id.startsWith("manual-new-")),
      deletedActivityIds,
      manualActivities
    };

    const response = await fetch(report.id ? `/api/reports/${report.id}` : "/api/reports", {
      method: report.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report.id ? reportPayload : { ...reportPayload, date: reportDate })
    });

    if (!response.ok) {
      setMessage((await response.json()).error ?? "Unable to save report.");
      setBusyAction(null);
      return;
    }

    const data = await response.json();
    let nextReport = data.report as Report;

    if (submit) {
      const submitResponse = await fetch(`/api/reports/${nextReport.id}/submit`, { method: "POST" });
      if (!submitResponse.ok) {
        setMessage((await submitResponse.json()).error ?? "Unable to submit report.");
        setBusyAction(null);
        return;
      }
      nextReport = (await submitResponse.json()).report as Report;
    }

    const nextSummary = editorSummaryForReport(nextReport);
    const nextBlockers = blockersForReport(nextReport);

    setReport(nextReport);
    setSummary(nextSummary);
    setBlockers(nextBlockers);
    setActivities(nextReport.activities);
    setDeletedActivityIds([]);
    setWorkLocation(nextReport.workLocation);
    summaryEditorRef.current?.setSnapshot({ summary: nextSummary, blockers: nextBlockers });
    setMessage(submit ? "Submitted for review." : "Draft saved.");
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

    const response = await fetch(`/api/reports/${report.id}`, { method: "DELETE" });

    if (!response.ok) {
      setMessage((await response.json()).error ?? "Unable to delete draft.");
      setBusyAction(null);
      return;
    }

    setReport((current) => ({
      ...current,
      id: "",
      summary: "",
      blockers: "",
      workLocation: "UNKNOWN",
      activities: [],
      updatedAt: null
    }));
    setSummary("");
    setBlockers("");
    setWorkLocation("UNKNOWN");
    setActivities([]);
    setDeletedActivityIds([]);
    summaryEditorRef.current?.setSnapshot({ summary: "", blockers: "" });
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
        body: JSON.stringify({ date })
      });

      if (!response.ok) {
        setMessage(await responseErrorMessage(response, `${providerLabel} import failed.`));
        return;
      }

      const result = (await response.json()) as { importedCount: number; skippedCount: number; staleCount?: number; activities?: Activity[] };
      setActivities((current) => mergeSyncedActivities(current, syncProviderSources[provider], result.activities ?? []));
      setActivityPage(1);

      setMessage(
        result.importedCount > 0
          ? `${providerLabel} import complete: ${result.importedCount} work item${result.importedCount === 1 ? "" : "s"} found${result.staleCount ? `, ${result.staleCount} stale item${result.staleCount === 1 ? "" : "s"} hidden` : ""}.`
          : `No ${providerLabel.toLowerCase()} work items found for this date.`
      );
    } catch {
      setMessage(`${providerLabel} import failed. Check your connection and try again.`);
    } finally {
      setImportingProvider(null);
    }
  }

  function connectProvider(provider: "google" | "atlassian") {
    signIn(
      provider,
      { callbackUrl: "/" },
      provider === "google"
        ? { access_type: "offline", prompt: "consent select_account", scope: GOOGLE_OAUTH_SCOPE }
        : {
            audience: "api.atlassian.com",
            prompt: "consent",
            scope: ATLASSIAN_OAUTH_SCOPE
          }
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
  const isSaving = busyAction === "save";
  const isSubmitting = busyAction === "submit";
  const isDeleting = busyAction === "delete";
  const isImporting = importingProvider !== null;
  const importStatusLabel = importingProvider ? `Importing ${syncProviderLabels[importingProvider].toLowerCase()}...` : "Import";
  const isBusy = busyAction !== null || isImporting;
  const hasPendingManual = activities.some((activity) => activity.id.startsWith("manual-new-"));
  const selectedCount = activities.filter((activity) => activity.selected).length;
  const lastSavedLabel = formatTimestamp(report.updatedAt);
  const blockerItems = blockers
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const normalizedActivitySearch = activitySearch.trim().toLowerCase();
  const filteredActivities = normalizedActivitySearch
    ? activities.filter((activity) =>
        [
          activity.title,
          activity.description,
          activity.status,
          sourceLabels[activity.source],
          formatDuration(activity.durationMinutes)
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedActivitySearch)
      )
    : activities;
  const filteredSelectedCount = filteredActivities.filter((activity) => activity.selected).length;
  const activityPageCount = Math.max(1, Math.ceil(filteredActivities.length / activityPageSize));
  const currentActivityPage = Math.min(activityPage, activityPageCount);
  const activityPageStart = filteredActivities.length === 0 ? 0 : (currentActivityPage - 1) * activityPageSize + 1;
  const activityPageEnd = Math.min(currentActivityPage * activityPageSize, filteredActivities.length);
  const pagedActivities = filteredActivities.slice((currentActivityPage - 1) * activityPageSize, currentActivityPage * activityPageSize);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(filteredActivities.length / activityPageSize));

    setActivityPage((current) => Math.min(current, pageCount));
  }, [filteredActivities.length]);
  const hasUnsavedChanges =
    summary !== editorSummaryForReport(report) ||
    blockers !== blockersForReport(report) ||
    workLocation !== report.workLocation ||
    !sameActivityState(activities, report.activities) ||
    deletedActivityIds.length > 0 ||
    hasPendingManual;

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  function goToReportDate(nextDate: string) {
    if (!nextDate) {
      return;
    }

    if (nextDate !== reportDate && hasUnsavedChanges && !window.confirm("You have unsaved changes. Leave this date without saving?")) {
      return;
    }

    router.push(`/?date=${nextDate}`);
  }

  function shiftReportDate(days: number) {
    const nextDate = toDate(reportDate) ?? new Date();
    nextDate.setDate(nextDate.getDate() + days);
    goToReportDate(nextDate.toISOString().slice(0, 10));
  }

  const menuActivity = openActivityMenu ? activities.find((activity) => activity.id === openActivityMenu.id) : null;

  return (
    <ReferenceAppShell
      active="report"
      variant="employee"
      userName={userName}
      userEmail={userEmail}
      userRole={userRole}
      userStatus={userStatus}
      timezone={timezone}
      mustChangePassword={mustChangePassword}
      currentReportDate={reportDate}
    >
      <main className="reference-page !pb-4 !pt-3">
        <section className="overflow-visible rounded-[18px] bg-white shadow-[0_14px_38px_rgba(15,23,42,0.09)] ring-1 ring-[#e6ebf3] dark:bg-[#0f1b2a] dark:ring-[#1d2d43]">
          <div className="flex flex-col gap-4 px-6 pb-5 pt-6 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between min-[1200px]:px-8">
            <div>
              <h1 className="text-[28px] font-semibold leading-tight tracking-normal text-[#111827] dark:text-foreground">Daily Update</h1>
              <p className="mt-1.5 text-sm text-[#667085] dark:text-muted-foreground">Share what you worked on today.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {report.id && report.status === "DRAFT" ? (
                <Button
                  variant="outline"
                  className="h-11 rounded-[8px] bg-white px-5 text-sm font-medium text-[#b42318] shadow-[0_2px_7px_rgba(15,23,42,0.06)] ring-1 ring-[#f3b8b2] hover:bg-[#fff5f5] dark:bg-[#101d2e] dark:text-red-300 dark:ring-red-400/25 dark:hover:bg-red-400/10"
                  disabled={isBusy}
                  onClick={deleteDraft}
                >
                  {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  {isDeleting ? "Deleting..." : "Delete draft"}
                </Button>
              ) : null}
              <Button
                variant="outline"
                className="h-11 rounded-[8px] bg-white px-6 text-sm font-medium text-[#111827] shadow-[0_2px_7px_rgba(15,23,42,0.06)] ring-1 ring-[#d9dee8] hover:bg-[#f8fafc] dark:bg-[#101d2e] dark:text-foreground dark:ring-[#263a55]"
                disabled={isBusy}
                onClick={() => saveReport(false)}
              >
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSaving ? "Saving..." : "Save draft"}
              </Button>
              <Button
                className="h-11 rounded-[8px] bg-gradient-to-br from-[#4f6dfd] to-[#4a28df] px-6 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(79,109,253,0.34)] hover:from-[#4663ed] hover:to-[#3f21c8]"
                disabled={isBusy || (report.status === "SUBMITTED" && !hasUnsavedChanges)}
                onClick={() => saveReport(true)}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {isSubmitting ? "Submitting..." : "Submit update"}
              </Button>
            </div>
          </div>

          <div className="mx-6 h-px bg-[#e5e9f1] dark:bg-[#213149] min-[1200px]:mx-8" />

          <div className="grid gap-3 px-6 py-4 min-[900px]:grid-cols-[minmax(320px,430px)_minmax(190px,240px)_minmax(260px,344px)] min-[900px]:items-center min-[900px]:justify-between min-[1200px]:px-8">
            <div className="flex w-full items-center gap-2">
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-white text-[#475467] shadow-[0_2px_7px_rgba(15,23,42,0.04)] ring-1 ring-[#dfe4ee] transition hover:bg-[#f8fafc] hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:bg-[#101d2e] dark:text-muted-foreground dark:ring-[#263a55] dark:hover:bg-[#132239] dark:hover:text-foreground"
                aria-label="Previous day"
                onClick={() => shiftReportDate(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <label className="relative flex h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[8px] bg-white px-5 text-sm font-medium text-[#111827] shadow-[0_2px_7px_rgba(15,23,42,0.04)] ring-1 ring-[#dfe4ee] dark:bg-[#101d2e] dark:text-foreground dark:ring-[#263a55]">
                <CalendarDays className="h-4 w-4 shrink-0 text-[#475467] dark:text-muted-foreground" />
                <span className="truncate">{formatReportDate(date)}</span>
                <Input
                  type="date"
                  value={reportDate}
                  onChange={(event) => goToReportDate(event.target.value)}
                  className="absolute inset-0 h-full cursor-pointer border-0 bg-transparent opacity-0"
                  aria-label="Select report date"
                />
              </label>
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-white text-[#475467] shadow-[0_2px_7px_rgba(15,23,42,0.04)] ring-1 ring-[#dfe4ee] transition hover:bg-[#f8fafc] hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:bg-[#101d2e] dark:text-muted-foreground dark:ring-[#263a55] dark:hover:bg-[#132239] dark:hover:text-foreground"
                aria-label="Next day"
                onClick={() => shiftReportDate(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <label className="flex min-h-11 w-full items-center gap-3 rounded-[8px] bg-white px-4 text-sm shadow-[0_2px_7px_rgba(15,23,42,0.04)] ring-1 ring-[#dfe4ee] dark:bg-[#101d2e] dark:ring-[#263a55]">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[#667085] dark:text-muted-foreground">Location</span>
              <Select
                value={workLocation}
                onChange={(event) => setWorkLocation(event.target.value as WorkLocation)}
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

            <div className="flex min-h-11 w-full items-center gap-4 rounded-[8px] bg-white px-4 text-sm shadow-[0_2px_7px_rgba(15,23,42,0.04)] ring-1 ring-[#dfe4ee] dark:bg-[#101d2e] dark:ring-[#263a55]">
              <span className={cn("inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-medium", hasUnsavedChanges ? "bg-orange-50 text-orange-700 dark:bg-orange-400/10 dark:text-orange-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300")}>
                <CheckCircle2 className="h-4 w-4" />
                {hasUnsavedChanges ? "Unsaved changes" : report.status === "SUBMITTED" ? "Submitted" : report.id ? "Draft saved" : "No saved draft"}
              </span>
              <span className="text-[#667085] dark:text-muted-foreground">{lastSavedLabel === "-" ? "Not saved yet" : `Last saved ${lastSavedLabel}`}</span>
            </div>
          </div>

          <div className="grid gap-4 border-t border-[#e8ecf3] px-6 py-5 dark:border-[#213149] min-[1200px]:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)] min-[1200px]:px-8">
            <section className="flex min-h-[660px] flex-col rounded-[12px] bg-white p-5 ring-1 ring-[#e1e6ef] dark:bg-[#101d2e] dark:ring-[#263a55]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-normal text-[#111827] dark:text-foreground">Work items</h2>
                    <ReferenceBadge tone="neutral" className="px-3 py-1.5 text-xs">{selectedCount} selected</ReferenceBadge>
                  </div>
                  <p className="mt-2 text-sm text-[#667085] dark:text-muted-foreground">Import and select work to include in your update.</p>
                </div>
                <div className="relative">
                  <Button
                    variant="outline"
                    className="h-10 rounded-[8px] bg-white px-4 text-sm font-medium text-[#111827] shadow-[0_2px_7px_rgba(15,23,42,0.04)] ring-1 ring-[#dfe4ee] hover:bg-[#f8fafc] dark:bg-[#0f1b2a] dark:text-foreground dark:ring-[#263a55]"
                    disabled={isBusy}
                    onClick={() => setImportMenuOpen((open) => !open)}
                  >
                    {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {importStatusLabel}
                    {!isImporting ? <ChevronDown className="ml-2 h-4 w-4" /> : null}
                  </Button>
                  {importMenuOpen ? (
                    <div className="absolute right-0 top-12 z-30 w-64 rounded-[12px] bg-white p-2 shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:ring-[#263a55]">
                      <button
                        className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
                        disabled={!canSyncJira && !oauthConfig.atlassian}
                        onClick={() => {
                          setImportMenuOpen(false);
                          canSyncJira ? sync("jira") : connectProvider("atlassian");
                        }}
                      >
                        {canSyncJira ? "Import Jira" : "Connect Jira"}
                      </button>
                      <button
                        className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
                        disabled={!canSyncGoogle && !oauthConfig.google}
                        onClick={() => {
                          setImportMenuOpen(false);
                          canSyncGoogle ? sync("google-calendar") : connectProvider("google");
                        }}
                      >
                        {canSyncGoogle ? "Import Calendar" : "Connect Google"}
                      </button>
                      <button
                        className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
                        disabled={!canSyncGoogle && !oauthConfig.google}
                        onClick={() => {
                          setImportMenuOpen(false);
                          canSyncGoogle ? sync("google-tasks") : connectProvider("google");
                        }}
                      >
                        {canSyncGoogle ? "Import Tasks" : "Connect Google Tasks"}
                      </button>
                      <Link
                        className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#2563eb] hover:bg-[#eff6ff] dark:text-[#93c5fd] dark:hover:bg-white/5"
                        href="/settings"
                        onClick={() => setImportMenuOpen(false)}
                      >
                        Manage integrations
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>

              <label className="relative mt-4 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
                <Input
                  value={activitySearch}
                  onChange={(event) => {
                    setActivitySearch(event.target.value);
                    setActivityPage(1);
                  }}
                  placeholder="Search work items"
                  className="h-10 rounded-[8px] bg-white pl-9 text-sm shadow-none ring-1 ring-[#dfe4ee] focus-visible:ring-2 dark:bg-[#0f1b2a] dark:ring-[#263a55]"
                  aria-label="Search work items"
                />
              </label>

              <div className="mt-4 h-[412px] space-y-2.5 overflow-y-auto pr-1">
                {activities.length === 0 ? (
                  <EmptyReferenceState>No activities yet. Import work from Jira, Calendar, or Tasks.</EmptyReferenceState>
                ) : pagedActivities.length === 0 ? (
                  <EmptyReferenceState>No work items match your search.</EmptyReferenceState>
                ) : (
                  pagedActivities.map((activity) => (
                    <article
                      key={activity.id}
                      className="grid min-h-[74px] grid-cols-[28px_40px_minmax(0,1fr)_auto_68px_28px] items-center gap-3 rounded-[10px] bg-white px-4 py-3 ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
                    >
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-[#cbd5e1] accent-[#4f46e5]"
                        checked={activity.selected}
                        onChange={(event) => setActivity(activity.id, { selected: event.target.checked })}
                        aria-label={`Include ${activity.title}`}
                      />
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-[8px]", sourceStyles[activity.source])}>{sourceIcon(activity.source)}</div>
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-[#111827] dark:text-foreground">
                          {activity.sourceUrl && activity.sourceUrl !== "#" ? (
                            <a href={activity.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-[#2563eb]">
                              {activity.title || "Untitled activity"}
                            </a>
                          ) : (
                            activity.title || "Untitled activity"
                          )}
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-[#667085] dark:text-muted-foreground">
                          <span className="shrink-0">{sourceLabels[activity.source]}</span>
                          {activity.description ? (
                            <>
                              <span className="text-[#98a2b3]">•</span>
                              <span className="truncate">{activity.description}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <ReferenceBadge tone={statusTone(activity.status)} className="justify-self-start px-2.5 py-1 text-xs">
                        {activity.status || "Not set"}
                      </ReferenceBadge>
                      <div className="text-base font-medium text-[#111827] dark:text-foreground">{formatDuration(activity.durationMinutes)}</div>
                      <button
                        className="reference-menu-button"
                        aria-label={`More actions for ${activity.title}`}
                        onClick={(event) => toggleActivityMenu(activity.id, event)}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </article>
                  ))
                )}
              </div>

              <div className="mt-auto border-t border-[#e6eaf2] pt-4 dark:border-[#263a55]">
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
                      disabled={currentActivityPage === 1 || filteredActivities.length === 0}
                      onClick={() => setActivityPage((page) => Math.max(1, page - 1))}
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
                      disabled={currentActivityPage === activityPageCount || filteredActivities.length === 0}
                      onClick={() => setActivityPage((page) => Math.min(activityPageCount, page + 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <aside className="min-h-[600px] rounded-[12px] bg-white p-5 ring-1 ring-[#e1e6ef] dark:bg-[#101d2e] dark:ring-[#263a55]">
              <div>
                <h2 className="text-xl font-semibold tracking-normal text-[#111827] dark:text-foreground">Summary</h2>
                <p className="mt-2 text-sm text-[#667085] dark:text-muted-foreground">Add a brief summary of your work.</p>
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
        </section>
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
                setActivity(menuActivity.id, { selected: !menuActivity.selected });
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
              {menuActivity.source === "MANUAL" ? "Delete item" : "Remove from report"}
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
    </ReferenceAppShell>
  );
}
