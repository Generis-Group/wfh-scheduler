"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import {
  ArrowLeft,
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Loader2,
  MoreVertical,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FixedToast } from "@/components/ui/fixed-toast";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Select } from "@/components/ui/select";
import { useDismissableLayer } from "@/components/ui/use-dismissable-layer";
import { EmptyReferenceState } from "@/components/reports/reference-shell";
import {
  ReportPdfDocument,
  type ReportPdfActivity,
  type ReportPdfComment,
} from "@/components/reports/report-pdf";
import { reportActivityStatusLabel } from "@/components/reports/report-ui";
import {
  SummaryRenderer,
  summaryPlainText,
} from "@/components/reports/summary-renderer";
import { markServerDataStale } from "@/lib/client-cache-invalidation";
import {
  fetchJsonWithClientCache,
  writeClientJsonCache,
} from "@/lib/client-request-cache";
import { anchoredFixedPlacement } from "@/lib/anchored-position";
import { dateOnlyDisplayDate, dateOnlyString } from "@/lib/date-only";
import {
  clampReportDateToToday,
  reportDayEnd,
  todayDateString,
} from "@/lib/dates";
import { defaultPaginationPageSize } from "@/lib/pagination";
import type { ActivitySourceLink } from "@/lib/activity-source-links";
import { workLocationLabel } from "@/lib/work-locations";
import { cn, titleCase } from "@/lib/utils";

type HistoryActivity = {
  id: string;
  source?: string | null;
  title: string;
  status?: string | null;
  durationMinutes?: number | null;
  employeeNote?: string | null;
  sourceUrl?: string | null;
  sourceLinks?: ActivitySourceLink[] | null;
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
  submittedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  user?: {
    departments?: Array<{
      role?: string | null;
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

type ReportHistoryPageResponse = {
  reports?: HistoryReport[];
  totalCount?: number;
  error?: string;
};

type PendingReportAction = {
  id: string;
  type: "submit" | "delete";
};

const reportHistoryRowGridClass =
  "min-[860px]:grid min-[860px]:grid-cols-[minmax(8.5rem,0.75fr)_minmax(7.5rem,0.6fr)_minmax(14rem,2.5fr)_minmax(7rem,0.55fr)] min-[860px]:items-center";

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

function reportDepartmentLabel(report: HistoryReport) {
  const departments =
    report.user?.departments
      ?.filter((membership) => (membership.role ?? "EMPLOYEE") === "EMPLOYEE")
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

export function ReportHistory({
  reports,
  initialTotalCount = reports.length,
  initialOpenedReportId = null,
  initialOpenedReport = null,
}: {
  reports: HistoryReport[];
  initialTotalCount?: number;
  initialOpenedReportId?: string | null;
  initialOpenedReport?: HistoryReport | null;
}) {
  const [items, setItems] = useState(reports);
  const [openedReportDetail, setOpenedReportDetail] =
    useState<HistoryReport | null>(initialOpenedReport);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(
    defaultPaginationPageSize,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [openedReportId, setOpenedReportId] = useState(
    initialOpenedReportId ?? "",
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDateValue, setToDateValue] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerPosition, setDatePickerPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [rowMenu, setRowMenu] = useState<{
    id: string;
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingReportAction, setPendingReportAction] =
    useState<PendingReportAction | null>(null);
  const [pendingPrintReportId, setPendingPrintReportId] = useState<
    string | null
  >(null);
  const datePickerRef = useRef<HTMLDivElement | null>(null);
  const datePickerPanelRef = useRef<HTMLDivElement | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const filterReadyRef = useRef(false);
  const cacheSeededRef = useRef(false);
  const immediateRefreshRef = useRef(false);
  const requestIdRef = useRef(0);
  const maxReportDate = todayDateString();

  useDismissableLayer({
    open: datePickerOpen,
    refs: [datePickerRef, datePickerPanelRef],
    onDismiss: () => setDatePickerOpen(false),
  });

  useDismissableLayer({
    open: Boolean(rowMenu),
    refs: [rowMenuRef],
    onDismiss: () => setRowMenu(null),
  });

  const updateDatePickerPosition = useCallback(() => {
    if (typeof window === "undefined" || !datePickerRef.current) {
      return;
    }

    const rect = datePickerRef.current.getBoundingClientRect();
    const placement = anchoredFixedPlacement({
      anchorRect: rect,
      preferredWidth: Math.max(rect.width, 320),
      preferredMaxHeight: 336,
      minHeight: 220,
      flipHeight: 260,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      viewportPadding: 8,
      gap: 6,
      align: "end",
    });

    setDatePickerPosition({
      top: placement.top,
      left: placement.left,
      width: placement.width,
      maxHeight: placement.maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!datePickerOpen) {
      setDatePickerPosition(null);
      return undefined;
    }

    window.addEventListener("resize", updateDatePickerPosition);
    window.addEventListener("scroll", updateDatePickerPosition, true);
    updateDatePickerPosition();

    return () => {
      window.removeEventListener("resize", updateDatePickerPosition);
      window.removeEventListener("scroll", updateDatePickerPosition, true);
    };
  }, [datePickerOpen, updateDatePickerPosition]);

  const reportPageCount = Math.max(1, Math.ceil(totalCount / reportPageSize));
  const currentReportPage = Math.min(reportPage, reportPageCount);

  const openedReport =
    items.find((report) => report.id === openedReportId) ??
    (openedReportDetail?.id === openedReportId ? openedReportDetail : null);
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

  const reportsUrl = useCallback(() => {
    const params = new URLSearchParams({
      limit: String(reportPageSize),
      page: String(currentReportPage),
      status: statusFilter,
    });
    const trimmedQuery = query.trim();

    if (trimmedQuery) {
      params.set("search", trimmedQuery);
    }

    if (fromDate) {
      params.set("fromDate", fromDate);
    }

    if (toDateValue) {
      params.set("toDate", toDateValue);
    }

    return `/api/reports/history?${params.toString()}`;
  }, [
    currentReportPage,
    fromDate,
    query,
    reportPageSize,
    statusFilter,
    toDateValue,
  ]);

  const loadReports = useCallback(
    async ({
      signal,
    }: {
      signal?: AbortSignal;
    } = {}) => {
      const requestId = ++requestIdRef.current;

      setIsRefreshing(true);
      setMessage(null);

      try {
        const data = await fetchJsonWithClientCache<ReportHistoryPageResponse>(
          reportsUrl(),
          {
            signal,
            errorMessage: "Unable to load reports.",
          },
        );

        if (requestId !== requestIdRef.current) {
          return false;
        }

        setItems(data.reports ?? []);
        setTotalCount(data.totalCount ?? 0);
        return true;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return false;
        }

        setMessage(
          error instanceof Error ? error.message : "Unable to load reports.",
        );
        return false;
      } finally {
        if (requestId === requestIdRef.current) {
          setIsRefreshing(false);
        }
      }
    },
    [reportsUrl],
  );

  function requestImmediateRefresh() {
    immediateRefreshRef.current = true;
    setIsRefreshing(true);
  }

  function changeReportPage(nextPage: number) {
    requestImmediateRefresh();
    setReportPage(nextPage);
  }

  function changeReportPageSize(nextPageSize: number) {
    if (nextPageSize === reportPageSize) {
      return;
    }

    requestImmediateRefresh();
    setReportPageSize(nextPageSize);
    setReportPage(1);
  }

  async function refreshReportsAfterMutation({
    pageMayBeEmpty = false,
  }: {
    pageMayBeEmpty?: boolean;
  } = {}) {
    markServerDataStale();

    if (pageMayBeEmpty && items.length <= 1 && currentReportPage > 1) {
      requestImmediateRefresh();
      setReportPage(currentReportPage - 1);
      return true;
    }

    return loadReports();
  }

  useEffect(() => {
    setOpenedReportId(initialOpenedReportId ?? "");
    setOpenedReportDetail(initialOpenedReport);
  }, [initialOpenedReport, initialOpenedReportId]);

  useEffect(() => {
    if (cacheSeededRef.current) {
      return;
    }

    cacheSeededRef.current = true;
    writeClientJsonCache<ReportHistoryPageResponse>(reportsUrl(), {
      reports,
      totalCount: initialTotalCount,
    });
  }, [initialTotalCount, reports, reportsUrl]);

  useEffect(() => {
    if (!filterReadyRef.current) {
      filterReadyRef.current = true;
      return;
    }

    const controller = new AbortController();
    const delayMs = immediateRefreshRef.current ? 0 : 250;
    immediateRefreshRef.current = false;
    const timeoutId = window.setTimeout(() => {
      void loadReports({ signal: controller.signal });
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [loadReports]);

  useEffect(() => {
    if (reportPage > reportPageCount) {
      setReportPage(reportPageCount);
    }
  }, [reportPage, reportPageCount]);

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
    setOpenedReportDetail(report);
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
        statusFilter === "DRAFT"
          ? current.filter((item) => item.id !== submitted.id)
          : current.map((item) =>
              item.id === submitted.id ? submitted : item,
            ),
      );
      setOpenedReportDetail((current) =>
        current?.id === submitted.id ? submitted : current,
      );
      if (statusFilter === "DRAFT") {
        setTotalCount((current) => Math.max(0, current - 1));
      }
      const refreshed = await refreshReportsAfterMutation({
        pageMayBeEmpty: statusFilter === "DRAFT",
      });

      if (!refreshed) {
        return;
      }

      setMessage("Draft submitted for review.");
    } catch {
      setMessage(
        "Unable to submit draft. Check your connection and try again.",
      );
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
      setOpenedReportDetail((current) =>
        current?.id === report.id ? null : current,
      );
      setTotalCount((current) => Math.max(0, current - 1));
      if (openedReportId === report.id) {
        backToReports();
      }
      setRowMenu(null);
      const refreshed = await refreshReportsAfterMutation({
        pageMayBeEmpty: true,
      });

      if (!refreshed) {
        return;
      }

      setMessage("Draft deleted.");
    } catch {
      setMessage(
        "Unable to delete draft. Check your connection and try again.",
      );
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
    const placement = anchoredFixedPlacement({
      anchorRect: rect,
      preferredWidth: 220,
      preferredMaxHeight: report.status === "DRAFT" ? 220 : 132,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });

    setDatePickerOpen(false);
    setRowMenu({
      id: report.id,
      top: placement.top,
      left: placement.left,
      width: placement.width,
      maxHeight: placement.maxHeight,
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
        <main className="reference-page min-[1024px]:flex min-[1024px]:h-full min-[1024px]:min-h-0 min-[1024px]:flex-col">
          <div className="reference-page-header shrink-0">
            <div className="min-w-0">
              <h1 className="reference-title">Review your submitted updates</h1>
            </div>
          </div>

          <section className="mb-3 shrink-0 rounded-lg bg-white p-3 shadow-[0_6px_18px_rgba(15,23,42,0.045)] ring-1 ring-border dark:bg-card dark:ring-border">
            <div className="grid gap-3 min-[980px]:grid-cols-[minmax(260px,1fr)_190px_320px_150px]">
              <label className="relative min-w-0">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setReportPage(1);
                  }}
                  placeholder="Search reports..."
                  className="h-11 rounded-lg bg-white pl-11 text-sm shadow-none ring-1 ring-border dark:bg-card dark:ring-border"
                />
              </label>
              <Select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setReportPage(1);
                }}
                className="h-11 rounded-lg bg-white text-sm ring-1 ring-border dark:bg-card dark:ring-border"
              >
                <option value="ALL">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="SUBMITTED">Submitted</option>
              </Select>
              <div ref={datePickerRef} className="relative">
                <button
                  type="button"
                  className="flex h-11 w-full items-center gap-3 rounded-lg bg-white px-4 text-left text-sm font-medium text-foreground ring-1 ring-border dark:bg-card dark:text-foreground dark:ring-border"
                  onClick={() => {
                    setRowMenu(null);
                    if (!datePickerOpen) {
                      updateDatePickerPosition();
                    }
                    setDatePickerOpen((open) => !open);
                  }}
                >
                  <CalendarDays className="h-4 w-4 text-foreground-muted" />
                  <span className="min-w-0 flex-1 truncate">
                    {dateRangeLabel}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
                {datePickerOpen && typeof document !== "undefined"
                  ? createPortal(
                      <div
                        ref={datePickerPanelRef}
                        role="dialog"
                        aria-label="Report history date range"
                        className="fixed z-[1000] overflow-y-auto overscroll-contain rounded-xl bg-white p-3 shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-border [scrollbar-gutter:stable] dark:bg-card dark:ring-border"
                        style={{
                          top: datePickerPosition?.top ?? 0,
                          left: datePickerPosition?.left ?? 0,
                          width: datePickerPosition?.width,
                          maxHeight: datePickerPosition?.maxHeight,
                          visibility: datePickerPosition
                            ? "visible"
                            : "hidden",
                        }}
                      >
                        <div className="grid gap-3">
                          <label className="text-xs font-medium text-muted-foreground">
                            From
                            <Input
                              type="date"
                              value={fromDate}
                              max={maxReportDate}
                              onChange={(event) => {
                                setReportPage(1);
                                setFromDate(
                                  event.target.value
                                    ? clampReportDateToToday(event.target.value)
                                    : "",
                                );
                              }}
                              className="mt-1 h-10"
                            />
                          </label>
                          <label className="text-xs font-medium text-muted-foreground">
                            To
                            <Input
                              type="date"
                              value={toDateValue}
                              max={maxReportDate}
                              onChange={(event) => {
                                setReportPage(1);
                                setToDateValue(
                                  event.target.value
                                    ? clampReportDateToToday(event.target.value)
                                    : "",
                                );
                              }}
                              className="mt-1 h-10"
                            />
                          </label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setFromDate("");
                              setToDateValue("");
                              setReportPage(1);
                              setDatePickerOpen(false);
                            }}
                          >
                            Clear dates
                          </Button>
                        </div>
                      </div>,
                      document.body,
                    )
                  : null}
              </div>
              <Button
                className="h-11 rounded-lg bg-primary text-sm font-semibold hover:bg-primary"
                onClick={openNewReport}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Report
              </Button>
            </div>
          </section>

          <section className="reference-paginated-surface rounded-lg bg-white shadow-[0_6px_18px_rgba(15,23,42,0.045)] ring-1 ring-border dark:bg-card dark:ring-border min-[1024px]:flex-1">
            <div
              className="reference-paginated-viewport"
              data-pagination-loading={
                isRefreshing && items.length > 0 ? "true" : undefined
              }
              aria-busy={isRefreshing}
            >
              {isRefreshing && items.length === 0 ? (
                <div className="p-4">
                  <EmptyReferenceState>Loading reports...</EmptyReferenceState>
                </div>
              ) : items.length === 0 ? (
                <div className="p-4">
                  <EmptyReferenceState>
                    No reports match the current filters. Create a report or
                    clear your filters.
                  </EmptyReferenceState>
                </div>
              ) : (
                <>
                  <div
                    className={cn(
                      "sticky top-0 z-10 hidden border-b border-border bg-white px-4 py-3 text-sm font-semibold text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground",
                      reportHistoryRowGridClass,
                    )}
                  >
                    <div className="flex items-center gap-2">
                      Date
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </div>
                    <div>Status</div>
                    <div>Summary</div>
                    <div className="text-right">Actions</div>
                  </div>
                  {items.map((report) => (
                    <article
                      key={report.id}
                      className={cn(
                        "space-y-3 border-b border-border px-4 py-3 last:border-b-0 dark:border-border min-[860px]:min-h-[86px] min-[860px]:space-y-0",
                        reportHistoryRowGridClass,
                      )}
                    >
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.02em] text-muted-foreground dark:text-muted-foreground min-[860px]:hidden">
                          Date
                        </div>
                        <div className="text-sm font-medium text-foreground dark:text-foreground">
                          {formatReportDate(report.reportDate)}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">
                          {formatWeekday(report.reportDate)}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.02em] text-muted-foreground dark:text-muted-foreground min-[860px]:hidden">
                          Status
                        </div>
                        <StatusPill tone={statusTone(report)}>
                          {statusLabel(report)}
                        </StatusPill>
                      </div>
                      <div className="min-w-0">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.02em] text-muted-foreground dark:text-muted-foreground min-[860px]:hidden">
                          Summary
                        </div>
                        <div className="truncate text-base text-foreground dark:text-foreground">
                          {summaryPlainText(report.summary)}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">
                          {report.activities.length} activit
                          {report.activities.length === 1 ? "y" : "ies"}{" "}
                          included
                        </div>
                      </div>
                      <div className="flex items-center justify-start gap-3 min-[860px]:justify-end">
                        <Button
                          variant="outline"
                          className="h-9 rounded-md bg-white px-4 text-sm font-medium ring-1 ring-border dark:bg-card dark:ring-border"
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
                  ))}
                </>
              )}
            </div>
            <PaginationControls
              className="reference-paginated-footer px-3 pb-3 pt-5"
              page={currentReportPage}
              pageSize={reportPageSize}
              pageSizeMenuPlacement="top"
              totalItems={totalCount}
              itemLabel="reports"
              isLoading={isRefreshing}
              onPageChange={changeReportPage}
              onPageSizeChange={changeReportPageSize}
            />
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
                className="fixed z-50 overflow-y-auto overscroll-contain rounded-xl bg-white p-1 text-sm shadow-[0_18px_42px_rgba(15,23,42,0.22)] ring-1 ring-border [scrollbar-gutter:stable] dark:bg-card dark:ring-border"
                style={{
                  top: rowMenu.top,
                  left: rowMenu.left,
                  width: rowMenu.width,
                  maxHeight: rowMenu.maxHeight,
                }}
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
            links: activity.sourceLinks,
            source: activity.source,
            title: activity.title,
          },
        ]),
      ),
    [report.activities],
  );
  const departmentLabel = reportDepartmentLabel(report);
  const comments = visibleReviewComments(report);
  const pdfActivities: ReportPdfActivity[] = includedActivities.map(
    (activity) => ({
      id: activity.id,
      title: activity.title,
      source: activity.source,
      sourceUrl: activity.sourceUrl,
      sourceLinks: activity.sourceLinks,
      duration: formatDuration(activity.durationMinutes),
      note: activity.employeeNote,
      status: reportActivityStatusLabel(activity.status),
    }),
  );
  const pdfComments: ReportPdfComment[] = comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    meta: `${formatTimestamp(comment.createdAt)} by ${
      comment.author?.name ?? comment.author?.email ?? "Review team"
    }`,
  }));
  const latestRevision = report.revisions[0];
  const currentStatusLabel = statusLabel(report);

  return (
    <ReportPdfDocument
      eyebrow="Generis Daily Report"
      title="Daily Report"
      subtitle={formatReportDate(report.reportDate)}
      status={
        currentStatusLabel === "Submitted"
          ? undefined
          : {
              label: currentStatusLabel,
              tone: statusTone(report),
            }
      }
      meta={[
        { label: "Department", value: departmentLabel },
        { label: "Location", value: workLocationLabel(report.workLocation) },
        { label: "Submitted", value: formatTimestamp(report.submittedAt) },
        { label: "Last updated", value: formatTimestamp(report.updatedAt) },
      ]}
      summary={
        <SummaryRenderer
          value={report.summary}
          activityReferences={activityReferences}
          emptyText="No summary recorded."
        />
      }
      activities={pdfActivities}
      comments={pdfComments}
      backControl={
        <button
          className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-subtle-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to reports
        </button>
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-10 rounded-lg bg-white px-4 text-sm font-medium ring-1 ring-border dark:bg-card dark:ring-border"
            disabled={isPending}
            onClick={onEdit}
          >
            <Edit3 className="mr-2 h-4 w-4" />
            Edit
          </Button>
          {report.status === "DRAFT" ? (
            <Button
              variant="outline"
              className="h-10 rounded-lg bg-white px-4 text-sm font-semibold text-destructive-subtle-foreground ring-1 ring-[#f3b8b2] hover:bg-destructive-subtle dark:bg-card dark:text-red-300 dark:ring-red-400/25 dark:hover:bg-red-400/10"
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
              className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold hover:bg-primary"
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
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold hover:bg-primary"
            disabled={isPending}
            onClick={() => onDownload()}
          >
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </div>
      }
      footer={
        latestRevision ? (
          <>
            {report.revisions.length} revision
            {report.revisions.length === 1 ? "" : "s"}. Last edited{" "}
            {formatTimestamp(latestRevision.createdAt)} by{" "}
            {latestRevision.editedBy?.name ??
              latestRevision.editedBy?.email ??
              "User"}
            .
          </>
        ) : null
      }
    />
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
      "bg-surface-subtle text-foreground-muted dark:bg-white/[0.05] dark:text-muted-foreground",
  };

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold leading-none",
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
        "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-white/5",
        destructive
          ? "text-destructive-subtle-foreground dark:text-red-300"
          : "text-foreground-muted dark:text-foreground",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}
