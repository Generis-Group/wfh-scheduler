"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  ArrowLeft,
  ArrowUpDown,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  ListChecks,
  Loader2,
  MessageCircle,
  MoreVertical,
  Plus,
  Search,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FixedToast } from "@/components/ui/fixed-toast";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useDismissableLayer } from "@/components/ui/use-dismissable-layer";
import { EmptyReferenceState } from "@/components/reports/reference-shell";
import {
  SummaryRenderer,
  summaryPlainText,
} from "@/components/reports/summary-renderer";
import { markServerDataStale } from "@/lib/client-cache-invalidation";
import { dateOnlyDisplayDate, dateOnlyString } from "@/lib/date-only";
import {
  clampReportDateToToday,
  reportDayEnd,
  todayDateString,
} from "@/lib/dates";
import { cn, titleCase } from "@/lib/utils";

type HistoryActivity = {
  id: string;
  source?: string | null;
  title: string;
  status?: string | null;
  durationMinutes?: number | null;
  employeeNote?: string | null;
  sourceUrl?: string | null;
};

type HistoryComment = {
  id: string;
  body: string;
  createdAt: string | Date;
  author?: { name?: string | null; email?: string | null } | null;
};

type HistoryReport = {
  id: string;
  reportDate: string | Date;
  status: "DRAFT" | "SUBMITTED";
  workLocation: string;
  summary: string;
  blockers: string;
  submittedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  user?: {
    departments?: Array<{
      department?: { name?: string | null } | null;
    }>;
  } | null;
  activities: HistoryActivity[];
  comments?: HistoryComment[];
  revisions: Array<{
    id: string;
    createdAt: string | Date;
    editedBy?: { name?: string | null; email?: string | null } | null;
  }>;
};

type PendingReportAction = {
  id: string;
  type: "submit" | "delete";
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

function dateInputValue(value: string | Date) {
  return dateOnlyString(value);
}

function formatReportDate(value: string | Date) {
  const date = dateOnlyDisplayDate(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatReportTitle(value: string | Date) {
  return `${formatReportDate(value)} Report`;
}

function formatWeekday(value: string | Date) {
  const date = dateOnlyDisplayDate(value);
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

function formatTimestamp(value?: string | Date | null) {
  const date = toDate(value);

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(minutes?: number | null) {
  if (!minutes) {
    return "-";
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours
    ? remaining
      ? `${hours}h ${remaining}m`
      : `${hours}h`
    : `${remaining}m`;
}

function isLate(report: HistoryReport) {
  const submittedAt = toDate(report.submittedAt);
  return Boolean(submittedAt && submittedAt > reportDayEnd(report.reportDate));
}

function editedAfterDate(report: HistoryReport) {
  return report.revisions.some((revision) => {
    const editedAt = toDate(revision.createdAt);
    return Boolean(editedAt && editedAt > reportDayEnd(report.reportDate));
  });
}

function sourceLabel(source?: string | null) {
  return source ? titleCase(source) : "Activity";
}

function reportDepartmentLabel(report: HistoryReport) {
  const departments =
    report.user?.departments
      ?.map((membership) => membership.department?.name)
      .filter(Boolean) ?? [];
  return departments.length ? departments.join(", ") : "No department";
}

function visibleReviewComments(report: HistoryReport) {
  return (
    report.comments?.filter(
      (comment) => comment.body.trim().toLowerCase() !== "reviewed",
    ) ?? []
  );
}

function statusLabel(report: HistoryReport) {
  if (editedAfterDate(report)) {
    return "Edited";
  }

  if (isLate(report)) {
    return "Late";
  }

  return titleCase(report.status);
}

function statusTone(report: HistoryReport): "green" | "orange" | "neutral" {
  if (
    report.status === "SUBMITTED" &&
    !isLate(report) &&
    !editedAfterDate(report)
  ) {
    return "green";
  }

  if (report.status === "DRAFT" || isLate(report) || editedAfterDate(report)) {
    return "orange";
  }

  return "neutral";
}

function activityStatusTone(
  status?: string | null,
): "green" | "orange" | "blue" | "neutral" {
  const normalized = status?.toLowerCase() ?? "";

  if (
    normalized.includes("done") ||
    normalized.includes("complete") ||
    normalized.includes("accepted")
  ) {
    return "green";
  }

  if (normalized.includes("progress")) {
    return "blue";
  }

  if (normalized.includes("todo") || normalized.includes("draft")) {
    return "orange";
  }

  return "neutral";
}

function activityStatusLabel(activity: HistoryActivity) {
  if (
    activity.source === "GOOGLE_TASKS" &&
    activity.status?.toLowerCase() === "completed"
  ) {
    return null;
  }

  return activity.status || "No status";
}

function sourceIcon(source?: string | null) {
  if (source === "GOOGLE_CALENDAR") {
    return <CalendarDays className="h-4 w-4" />;
  }

  if (source === "GOOGLE_TASKS") {
    return <CheckCircle2 className="h-4 w-4" />;
  }

  return <FileText className="h-4 w-4" />;
}

function getInitialOpenedId() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("reportId") ?? "";
}

const PAGE_SIZE = 8;

export function ReportHistory({ reports }: { reports: HistoryReport[] }) {
  const [items, setItems] = useState(reports);
  const [openedReportId, setOpenedReportId] = useState(getInitialOpenedId);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDateValue, setToDateValue] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingReportAction, setPendingReportAction] =
    useState<PendingReportAction | null>(null);
  const [page, setPage] = useState(1);
  const [pendingPrintReportId, setPendingPrintReportId] = useState<
    string | null
  >(null);
  const datePickerRef = useRef<HTMLDivElement | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const maxReportDate = todayDateString();

  useDismissableLayer({
    open: datePickerOpen,
    refs: [datePickerRef],
    onDismiss: () => setDatePickerOpen(false),
  });

  useDismissableLayer({
    open: Boolean(rowMenu),
    refs: [rowMenuRef],
    onDismiss: () => setRowMenu(null),
  });

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter((report) => {
      const date = dateInputValue(report.reportDate);
      const matchesQuery =
        !normalizedQuery ||
        report.summary.toLowerCase().includes(normalizedQuery) ||
        report.blockers.toLowerCase().includes(normalizedQuery) ||
        report.activities.some((activity) =>
          activity.title.toLowerCase().includes(normalizedQuery),
        );
      const matchesStatus =
        statusFilter === "ALL" || report.status === statusFilter;
      const matchesFrom = !fromDate || date >= fromDate;
      const matchesTo = !toDateValue || date <= toDateValue;

      return matchesQuery && matchesStatus && matchesFrom && matchesTo;
    });
  }, [fromDate, items, query, statusFilter, toDateValue]);

  const openedReport =
    items.find((report) => report.id === openedReportId) ?? null;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginatedReports = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const dateRangeLabel = useMemo(() => {
    if (fromDate || toDateValue) {
      return `${fromDate ? formatReportDate(fromDate) : "Start"} - ${toDateValue ? formatReportDate(toDateValue) : "Today"}`;
    }

    if (items.length === 0) {
      return "All dates";
    }

    const sortedDates = items
      .map((report) => dateInputValue(report.reportDate))
      .sort();
    return `${formatReportDate(sortedDates[0])} - ${formatReportDate(sortedDates[sortedDates.length - 1])}`;
  }, [fromDate, items, toDateValue]);

  useEffect(() => {
    setPage(1);
  }, [fromDate, query, statusFilter, toDateValue]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  useEffect(() => {
    if (!pendingPrintReportId || openedReport?.id !== pendingPrintReportId) {
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        window.print();
        setPendingPrintReportId(null);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [openedReport, pendingPrintReportId]);

  useEffect(() => {
    function closeMenus() {
      setRowMenu(null);
    }

    window.addEventListener("resize", closeMenus);
    window.addEventListener("scroll", closeMenus, true);

    return () => {
      window.removeEventListener("resize", closeMenus);
      window.removeEventListener("scroll", closeMenus, true);
    };
  }, []);

  function updateReportParam(reportId: string | null) {
    const url = new URL(window.location.href);
    if (reportId) {
      url.searchParams.set("reportId", reportId);
    } else {
      url.searchParams.delete("reportId");
    }
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
  }

  function openReport(report: HistoryReport) {
    setOpenedReportId(report.id);
    setRowMenu(null);
    updateReportParam(report.id);
  }

  function backToReports() {
    setOpenedReportId("");
    setRowMenu(null);
    updateReportParam(null);
  }

  function openReportDate(date: string) {
    window.location.href = `/?date=${clampReportDateToToday(date)}`;
  }

  function openNewReport() {
    openReportDate(todayDateString());
  }

  function editReport(report: HistoryReport) {
    openReportDate(dateInputValue(report.reportDate));
  }

  async function submitDraft(report: HistoryReport) {
    if (pendingReportAction) {
      return;
    }

    if (report.status === "SUBMITTED") {
      openReport(report);
      return;
    }

    flushSync(() => {
      setPendingReportAction({ id: report.id, type: "submit" });
      setMessage(null);
    });

    try {
      const response = await fetch(`/api/reports/${report.id}/submit`, {
        method: "POST",
      });
      if (!response.ok) {
        setMessage((await response.json()).error ?? "Unable to submit draft.");
        return;
      }

      const { report: submitted } = (await response.json()) as {
        report: HistoryReport;
      };
      setItems((current) =>
        current.map((item) => (item.id === submitted.id ? submitted : item)),
      );
      markServerDataStale();
      setMessage("Draft submitted for review.");
    } catch {
      setMessage("Unable to submit draft. Check your connection and try again.");
    } finally {
      setPendingReportAction(null);
    }
  }

  async function deleteDraft(report: HistoryReport) {
    if (pendingReportAction) {
      return;
    }

    if (report.status !== "DRAFT") {
      openReport(report);
      return;
    }

    if (!window.confirm("Delete this draft? This cannot be undone.")) {
      setRowMenu(null);
      return;
    }

    flushSync(() => {
      setPendingReportAction({ id: report.id, type: "delete" });
      setMessage(null);
    });

    try {
      const response = await fetch(`/api/reports/${report.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setMessage((await response.json()).error ?? "Unable to delete draft.");
        return;
      }

      setItems((current) => current.filter((item) => item.id !== report.id));
      if (openedReportId === report.id) {
        backToReports();
      }
      setRowMenu(null);
      markServerDataStale();
      setMessage("Draft deleted.");
    } catch {
      setMessage("Unable to delete draft. Check your connection and try again.");
    } finally {
      setPendingReportAction(null);
    }
  }

  function toggleRowMenu(
    report: HistoryReport,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    if (rowMenu?.id === report.id) {
      setRowMenu(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = report.status === "DRAFT" ? 220 : 132;
    setDatePickerOpen(false);
    setRowMenu({
      id: report.id,
      top: Math.min(
        window.innerHeight - menuHeight - 12,
        Math.max(12, rect.bottom + 8),
      ),
      left: Math.min(
        window.innerWidth - menuWidth - 12,
        Math.max(12, rect.right - menuWidth),
      ),
    });
  }

  async function copyReportLink(report: HistoryReport) {
    const url = new URL(window.location.href);
    url.searchParams.set("reportId", report.id);
    await navigator.clipboard?.writeText(url.toString());
    setRowMenu(null);
    setMessage("Report link copied.");
  }

  function downloadPdf(report?: HistoryReport) {
    if (report) {
      setOpenedReportId(report.id);
      setPendingPrintReportId(report.id);
      setRowMenu(null);
      updateReportParam(report.id);
      return;
    }

    window.print();
  }

  const menuReport = rowMenu
    ? items.find((report) => report.id === rowMenu.id)
    : null;
  const menuReportPending =
    menuReport && pendingReportAction?.id === menuReport.id
      ? pendingReportAction
      : null;

  return (
    <>
      {openedReport ? (
        <OpenedReportView
          report={openedReport}
          pendingAction={pendingReportAction}
          onBack={backToReports}
          onEdit={() => editReport(openedReport)}
          onSubmit={() => submitDraft(openedReport)}
          onDelete={() => deleteDraft(openedReport)}
          onDownload={downloadPdf}
        />
      ) : (
        <main className="reference-page">
          <div className="mb-3">
            <h1 className="text-[24px] font-semibold leading-tight tracking-normal text-[#111827] dark:text-foreground">
              Reports
            </h1>
            <p className="mt-0.5 text-sm text-[#667085] dark:text-muted-foreground">
              Review saved drafts and submitted reports.
            </p>
          </div>

          <section className="mb-3 rounded-[8px] bg-white p-3 shadow-[0_6px_18px_rgba(15,23,42,0.045)] ring-1 ring-[#e6ebf3] dark:bg-[#0f1b2a] dark:ring-[#1d2d43]">
            <div className="grid gap-3 min-[980px]:grid-cols-[minmax(260px,1fr)_190px_320px_150px]">
              <label className="relative min-w-0">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667085]" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search reports..."
                  className="h-11 rounded-[8px] bg-white pl-11 text-sm shadow-none ring-1 ring-[#dfe4ee] dark:bg-[#101d2e] dark:ring-[#263a55]"
                />
              </label>
              <Select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                }}
                className="h-11 rounded-[8px] bg-white text-sm ring-1 ring-[#dfe4ee] dark:bg-[#101d2e] dark:ring-[#263a55]"
              >
                <option value="ALL">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="SUBMITTED">Submitted</option>
              </Select>
              <div ref={datePickerRef} className="relative">
                <button
                  className="flex h-11 w-full items-center gap-3 rounded-[8px] bg-white px-4 text-left text-sm font-medium text-[#111827] ring-1 ring-[#dfe4ee] dark:bg-[#101d2e] dark:text-foreground dark:ring-[#263a55]"
                  onClick={() => {
                    setRowMenu(null);
                    setDatePickerOpen((open) => !open);
                  }}
                >
                  <CalendarDays className="h-4 w-4 text-[#475467]" />
                  <span className="min-w-0 flex-1 truncate">
                    {dateRangeLabel}
                  </span>
                  <ChevronDown className="h-4 w-4 text-[#667085]" />
                </button>
                {datePickerOpen ? (
                  <div className="absolute right-0 top-[3.25rem] z-30 w-[320px] rounded-[12px] bg-white p-3 shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:ring-[#263a55]">
                    <div className="grid gap-3">
                      <label className="text-xs font-medium text-[#667085]">
                        From
                        <Input
                          type="date"
                          value={fromDate}
                          max={maxReportDate}
                          onChange={(event) =>
                            setFromDate(
                              event.target.value
                                ? clampReportDateToToday(event.target.value)
                                : "",
                            )
                          }
                          className="mt-1 h-10"
                        />
                      </label>
                      <label className="text-xs font-medium text-[#667085]">
                        To
                        <Input
                          type="date"
                          value={toDateValue}
                          max={maxReportDate}
                          onChange={(event) =>
                            setToDateValue(
                              event.target.value
                                ? clampReportDateToToday(event.target.value)
                                : "",
                            )
                          }
                          className="mt-1 h-10"
                        />
                      </label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setFromDate("");
                          setToDateValue("");
                          setDatePickerOpen(false);
                        }}
                      >
                        Clear dates
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
              <Button
                className="h-11 rounded-[8px] bg-[#2563eb] text-sm font-semibold hover:bg-[#1d4ed8]"
                onClick={openNewReport}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Report
              </Button>
            </div>
          </section>

          <section className="overflow-hidden rounded-[8px] bg-white shadow-[0_6px_18px_rgba(15,23,42,0.045)] ring-1 ring-[#e6ebf3] dark:bg-[#0f1b2a] dark:ring-[#1d2d43]">
            <div className="grid grid-cols-[170px_190px_minmax(0,1fr)_190px] border-b border-[#e8ecf3] px-4 py-3 text-sm font-semibold text-[#667085] dark:border-[#263a55] dark:text-muted-foreground">
              <div className="flex items-center gap-2">
                Date
                <ArrowUpDown className="h-3.5 w-3.5" />
              </div>
              <div>Status</div>
              <div>Summary</div>
              <div className="text-right">Actions</div>
            </div>

            {filtered.length === 0 ? (
              <div className="p-6">
                <EmptyReferenceState>
                  No reports match the current filters. Create a report or clear
                  your filters.
                </EmptyReferenceState>
              </div>
            ) : (
              paginatedReports.map((report) => (
                <article
                  key={report.id}
                  className="grid min-h-[86px] grid-cols-[170px_190px_minmax(0,1fr)_190px] items-center border-b border-[#e8ecf3] px-4 py-3 last:border-b-0 dark:border-[#263a55]"
                >
                  <div>
                    <div className="text-sm font-medium text-[#111827] dark:text-foreground">
                      {formatReportDate(report.reportDate)}
                    </div>
                    <div className="mt-1 text-sm text-[#667085] dark:text-muted-foreground">
                      {formatWeekday(report.reportDate)}
                    </div>
                  </div>
                  <div>
                    <StatusPill tone={statusTone(report)}>
                      {statusLabel(report)}
                    </StatusPill>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-base text-[#111827] dark:text-foreground">
                      {summaryPlainText(report.summary)}
                    </div>
                    <div className="mt-1 text-sm text-[#667085] dark:text-muted-foreground">
                      {report.activities.length} activit
                      {report.activities.length === 1 ? "y" : "ies"} included
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <Button
                      variant="outline"
                      className="h-9 rounded-[7px] bg-white px-4 text-sm font-medium ring-1 ring-[#dfe4ee] dark:bg-[#101d2e] dark:ring-[#263a55]"
                      onClick={() => openReport(report)}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open
                    </Button>
                    <button
                      className="reference-menu-button"
                      aria-label={`More actions for ${formatReportDate(report.reportDate)}`}
                      onClick={(event) => toggleRowMenu(report, event)}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8ecf3] px-4 py-3 text-sm text-[#667085] dark:border-[#263a55] dark:text-muted-foreground">
              <span>
                Showing{" "}
                {filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}-
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length} reports
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Previous
                </Button>
                <span className="flex h-9 min-w-9 items-center justify-center rounded-[8px] px-3 text-sm font-semibold text-[#2563eb] ring-1 ring-[#2563eb]">
                  {currentPage}/{pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === pageCount}
                  onClick={() =>
                    setPage((value) => Math.min(pageCount, value + 1))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          </section>

          {menuReport && rowMenu ? (
            <>
              <button
                className="fixed inset-0 z-40 cursor-default bg-transparent"
                aria-label="Close report menu"
                onClick={() => setRowMenu(null)}
              />
              <div
                ref={rowMenuRef}
                className="fixed z-50 w-[220px] rounded-[10px] bg-white p-1 text-sm shadow-[0_18px_42px_rgba(15,23,42,0.22)] ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
                style={{ top: rowMenu.top, left: rowMenu.left }}
                role="menu"
              >
                <MenuButton
                  icon={<ExternalLink className="h-4 w-4" />}
                  onClick={() => openReport(menuReport)}
                >
                  Open report
                </MenuButton>
                <MenuButton
                  icon={<Edit3 className="h-4 w-4" />}
                  onClick={() => editReport(menuReport)}
                >
                  Edit report
                </MenuButton>
                {menuReport.status === "DRAFT" ? (
                  <MenuButton
                    icon={
                      menuReportPending?.type === "submit" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )
                    }
                    disabled={Boolean(pendingReportAction)}
                    onClick={() => submitDraft(menuReport)}
                  >
                    {menuReportPending?.type === "submit"
                      ? "Submitting..."
                      : "Submit draft"}
                  </MenuButton>
                ) : null}
                {menuReport.status === "DRAFT" ? (
                  <MenuButton
                    icon={
                      menuReportPending?.type === "delete" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )
                    }
                    destructive
                    disabled={Boolean(pendingReportAction)}
                    onClick={() => deleteDraft(menuReport)}
                  >
                    {menuReportPending?.type === "delete"
                      ? "Deleting..."
                      : "Delete draft"}
                  </MenuButton>
                ) : null}
                <MenuButton
                  icon={<Download className="h-4 w-4" />}
                  onClick={() => downloadPdf(menuReport)}
                >
                  Download PDF
                </MenuButton>
                <MenuButton
                  icon={<FileText className="h-4 w-4" />}
                  onClick={() => copyReportLink(menuReport)}
                >
                  Copy link
                </MenuButton>
              </div>
            </>
          ) : null}
        </main>
      )}
      <FixedToast message={message} onDismiss={() => setMessage(null)} />
    </>
  );
}

function OpenedReportView({
  report,
  pendingAction,
  onBack,
  onEdit,
  onSubmit,
  onDelete,
  onDownload,
}: {
  report: HistoryReport;
  pendingAction: PendingReportAction | null;
  onBack: () => void;
  onEdit: () => void;
  onSubmit: () => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const isSubmitting =
    pendingAction?.id === report.id && pendingAction.type === "submit";
  const isDeleting =
    pendingAction?.id === report.id && pendingAction.type === "delete";
  const isPending = pendingAction !== null;
  const includedActivities = report.activities;
  const activityReferences = useMemo(
    () =>
      Object.fromEntries(
        report.activities.map((activity) => [
          activity.id,
          {
            href: activity.sourceUrl,
            source: activity.source,
            title: activity.title,
          },
        ]),
      ),
    [report.activities],
  );
  const departmentLabel = reportDepartmentLabel(report);
  const comments = visibleReviewComments(report);

  return (
    <main className="reference-page report-pdf-page !pb-4 !pt-3">
      <div className="report-pdf-document mx-auto max-w-[1120px]">
        <button
          className="report-pdf-back mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to reports
        </button>

        <div className="report-pdf-header mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="report-pdf-print-only text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Generis Daily Report
            </p>
            <h1 className="text-[26px] font-semibold leading-tight tracking-normal text-[#111827] dark:text-foreground">
              {formatReportTitle(report.reportDate)}
            </h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill tone={statusTone(report)}>
                {statusLabel(report)}
              </StatusPill>
              <StatusPill tone="blue">
                {titleCase(report.workLocation)}
              </StatusPill>
            </div>
          </div>
          <div className="report-pdf-actions flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="h-10 rounded-[8px] bg-white px-5 text-sm font-medium ring-1 ring-[#dfe4ee] dark:bg-[#101d2e] dark:ring-[#263a55]"
              disabled={isPending}
              onClick={onEdit}
            >
              <Edit3 className="mr-2 h-4 w-4" />
              Edit
            </Button>
            {report.status === "DRAFT" ? (
              <Button
                variant="outline"
                className="h-10 rounded-[8px] bg-white px-5 text-sm font-semibold text-[#b42318] ring-1 ring-[#f3b8b2] hover:bg-[#fff5f5] dark:bg-[#101d2e] dark:text-red-300 dark:ring-red-400/25 dark:hover:bg-red-400/10"
                disabled={isPending}
                onClick={onDelete}
              >
                {isDeleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                {isDeleting ? "Deleting..." : "Delete draft"}
              </Button>
            ) : null}
            {report.status === "DRAFT" ? (
              <Button
                className="h-10 rounded-[8px] bg-[#2563eb] px-5 text-sm font-semibold hover:bg-[#1d4ed8]"
                disabled={isPending}
                onClick={onSubmit}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {isSubmitting ? "Submitting..." : "Submit draft"}
              </Button>
            ) : null}
            <Button
              className="h-10 rounded-[8px] bg-[#2563eb] px-5 text-sm font-semibold hover:bg-[#1d4ed8]"
              disabled={isPending}
              onClick={onDownload}
            >
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </div>
        </div>

        <section className="report-pdf-card mb-3 grid rounded-[10px] bg-white ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:ring-[#263a55] min-[900px]:grid-cols-4">
          <Metric
            icon={<CalendarDays className="h-4 w-4" />}
            label="Submitted"
            value={formatTimestamp(report.submittedAt)}
          />
          <Metric
            icon={<ClockIcon />}
            label="Last saved"
            value={formatTimestamp(report.updatedAt)}
          />
          <Metric
            icon={<ListChecks className="h-4 w-4" />}
            label="Included activities"
            value={String(includedActivities.length)}
          />
          <Metric
            icon={<UserRound className="h-4 w-4" />}
            label="Department"
            value={departmentLabel}
          />
        </section>

        <ReportSection title="1. Summary">
          <SummaryRenderer
            value={report.summary}
            blockers={report.blockers}
            activityReferences={activityReferences}
          />
        </ReportSection>

        <ReportSection
          title={`2. Included activities (${includedActivities.length})`}
        >
          {includedActivities.length === 0 ? (
            <p className="text-sm text-[#667085] dark:text-muted-foreground">
              No activities included.
            </p>
          ) : (
            <div className="overflow-hidden rounded-[8px] ring-1 ring-[#e1e6ef] dark:ring-[#263a55]">
              {includedActivities.map((activity) => {
                const statusLabel = activityStatusLabel(activity);

                return (
                  <div
                    key={activity.id}
                    className="grid gap-3 border-b border-[#e8ecf3] bg-white px-3 py-2.5 last:border-b-0 dark:border-[#263a55] dark:bg-[#101d2e] min-[820px]:grid-cols-[40px_minmax(0,1fr)_180px_150px_80px] min-[820px]:items-center"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#f4f7fb] text-[#475467] dark:bg-white/[0.05] dark:text-muted-foreground">
                      {sourceIcon(activity.source)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#111827] dark:text-foreground">
                        {activity.title || "Untitled activity"}
                      </div>
                      <div className="mt-1 truncate text-xs text-[#667085] dark:text-muted-foreground">
                        {activity.employeeNote || "No note added."}
                      </div>
                    </div>
                    <div className="text-xs text-[#667085] dark:text-muted-foreground">
                      Source: {sourceLabel(activity.source)}
                    </div>
                    {statusLabel ? (
                      <StatusPill tone={activityStatusTone(activity.status)}>
                        {statusLabel}
                      </StatusPill>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                    <div className="text-right text-sm text-[#475467] dark:text-muted-foreground">
                      {formatDuration(activity.durationMinutes)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ReportSection>

        <ReportSection title="3. Blockers">
          <p className="whitespace-pre-wrap text-sm leading-6 text-[#111827] dark:text-foreground">
            {report.blockers || "No blockers recorded."}
          </p>
        </ReportSection>

        <ReportSection title="4. Review comments">
          {comments.length ? (
            <div className="space-y-2">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="flex gap-3 rounded-[8px] bg-[#eff6ff] p-2.5 ring-1 ring-[#bfdbfe] dark:bg-blue-400/10 dark:ring-blue-300/15"
                >
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#2563eb]" />
                  <div>
                    <p className="text-sm leading-6 text-[#1f3b68] dark:text-blue-100">
                      {comment.body}
                    </p>
                    <p className="mt-1 text-xs text-[#667085] dark:text-muted-foreground">
                      {formatTimestamp(comment.createdAt)} by{" "}
                      {departmentLabel === "No department"
                        ? "Review team"
                        : `${departmentLabel} review`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#667085] dark:text-muted-foreground">
              No review comments yet.
            </p>
          )}
        </ReportSection>

        <ReportSection title="5. Revision history">
          {report.revisions.length ? (
            <div className="space-y-2">
              {report.revisions.map((revision) => (
                <div
                  key={revision.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] bg-[#f8fafc] px-3 py-2 text-sm dark:bg-white/[0.04]"
                >
                  <span className="font-medium text-[#111827] dark:text-foreground">
                    {revision.editedBy?.name ??
                      revision.editedBy?.email ??
                      "User"}
                  </span>
                  <span className="text-xs text-[#667085] dark:text-muted-foreground">
                    {formatTimestamp(revision.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#667085] dark:text-muted-foreground">
              No revisions recorded.
            </p>
          )}
        </ReportSection>
      </div>
    </main>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "green" | "orange" | "blue" | "neutral";
  children: ReactNode;
}) {
  const tones = {
    green:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
    orange:
      "bg-orange-50 text-orange-700 dark:bg-orange-400/10 dark:text-orange-300",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
    neutral:
      "bg-[#f4f7fb] text-[#52647a] dark:bg-white/[0.05] dark:text-[#b5c2d3]",
  };

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-[7px] px-3 py-1.5 text-sm font-semibold leading-none",
        tones[tone],
      )}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      {children}
    </span>
  );
}

function MenuButton({
  icon,
  children,
  onClick,
  destructive = false,
  disabled = false,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-white/5",
        destructive
          ? "text-[#b42318] dark:text-red-300"
          : "text-[#334155] dark:text-foreground",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="report-pdf-metric flex min-h-[64px] items-center gap-3 border-b border-[#e8ecf3] px-5 py-3 last:border-b-0 dark:border-[#263a55] min-[900px]:border-b-0 min-[900px]:border-r min-[900px]:last:border-r-0">
      <span className="text-[#40516c] dark:text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[#40516c] dark:text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 truncate text-sm text-[#667085] dark:text-muted-foreground">
          {value}
        </div>
      </div>
    </div>
  );
}

function ReportSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="report-pdf-card mb-2.5 rounded-[10px] bg-white p-4 ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:ring-[#263a55]">
      <h2 className="mb-2.5 text-base font-semibold text-[#111827] dark:text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ClockIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
