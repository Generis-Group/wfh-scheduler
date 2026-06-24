"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Loader2, Search, Trash2 } from "lucide-react";

import { EmptyReferenceState } from "@/components/reports/reference-shell";
import { ReportStatusBadge } from "@/components/reports/report-ui";
import { Button } from "@/components/ui/button";
import { FixedToast } from "@/components/ui/fixed-toast";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Select } from "@/components/ui/select";
import { markServerDataStale } from "@/lib/client-cache-invalidation";
import {
  fetchJsonWithClientCache,
  writeClientJsonCache,
} from "@/lib/client-request-cache";
import { defaultPaginationPageSize } from "@/lib/pagination";
import { workLocationLabel } from "@/lib/work-locations";
import { initials } from "@/lib/utils";

type AdminManagedReport = {
  id: string;
  reportDate: string | Date;
  status: "DRAFT" | "SUBMITTED";
  workLocation: string;
  summary: string;
  submittedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    departments?: Array<{
      role?: string | null;
      department?: { name?: string | null } | null;
    }>;
  };
  _count: {
    activities: number;
    comments: number;
    revisions: number;
  };
};

type StatusFilter = "ALL" | "SUBMITTED" | "DRAFT";
const defaultAdminReportPageSize = defaultPaginationPageSize;

type AdminReportsPageResponse = {
  reports?: AdminManagedReport[];
  totalCount?: number;
  error?: string;
};

export function AdminReportsManager({
  initialReports,
  initialTotalCount = initialReports.length,
}: {
  initialReports: AdminManagedReport[];
  initialTotalCount?: number;
}) {
  const [reports, setReports] = useState(initialReports);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(
    defaultAdminReportPageSize,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const filterReadyRef = useRef(false);
  const cacheSeededRef = useRef(false);
  const immediateRefreshRef = useRef(false);
  const requestIdRef = useRef(0);

  const reportPageCount = Math.max(1, Math.ceil(totalCount / reportPageSize));
  const currentReportPage = Math.min(reportPage, reportPageCount);

  const reportsUrl = useCallback(() => {
    const params = new URLSearchParams({
      limit: String(reportPageSize),
      page: String(currentReportPage),
      status: statusFilter,
    });
    const query = search.trim();

    if (query) {
      params.set("search", query);
    }

    return `/api/admin/reports?${params.toString()}`;
  }, [currentReportPage, reportPageSize, search, statusFilter]);

  const loadReports = useCallback(
    async ({
      signal,
    }: {
      signal?: AbortSignal;
    } = {}) => {
      const requestId = ++requestIdRef.current;

      setIsRefreshing(true);

      try {
        const data = await fetchJsonWithClientCache<AdminReportsPageResponse>(
          reportsUrl(),
          {
            signal,
            errorMessage: "Unable to load reports.",
          },
        );

        if (requestId !== requestIdRef.current) {
          return false;
        }

        setReports(data.reports ?? []);
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

    if (pageMayBeEmpty && reports.length <= 1 && currentReportPage > 1) {
      requestImmediateRefresh();
      setReportPage(currentReportPage - 1);
      return true;
    }

    return loadReports();
  }

  useEffect(() => {
    if (cacheSeededRef.current) {
      return;
    }

    cacheSeededRef.current = true;
    writeClientJsonCache<AdminReportsPageResponse>(reportsUrl(), {
      reports: initialReports,
      totalCount: initialTotalCount,
    });
  }, [initialReports, initialTotalCount, reportsUrl]);

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

  async function deleteReport(report: AdminManagedReport) {
    if (deletingReportId) {
      return;
    }

    const employee = report.user.name ?? report.user.email ?? "this employee";

    if (
      !window.confirm(
        `Delete ${employee}'s ${formatReportDate(report.reportDate)} report? This cannot be undone.`,
      )
    ) {
      return;
    }

    setDeletingReportId(report.id);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/reports/${encodeURIComponent(report.id)}`,
        { method: "DELETE" },
      );
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to delete report.");
      }

      setReports((current) => current.filter((item) => item.id !== report.id));
      setTotalCount((current) => Math.max(0, current - 1));
      const refreshed = await refreshReportsAfterMutation({
        pageMayBeEmpty: true,
      });

      if (!refreshed) {
        return;
      }

      setMessage("Report deleted.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to delete report.",
      );
    } finally {
      setDeletingReportId((current) =>
        current === report.id ? null : current,
      );
    }
  }

  return (
    <>
      <section className="reference-card reference-paginated-surface p-0 min-[1024px]:h-full">
        <div className="shrink-0 border-b border-[#e5eaf2] p-3 dark:border-[#263a55]">
          <div className="flex flex-col gap-3 min-[820px]:flex-row min-[820px]:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]"
                aria-hidden="true"
              />
              <Input
                aria-label="Search managed reports"
                className="h-10 bg-white pl-9 ring-1 ring-[#dbe5f4] dark:bg-[#0b1523] dark:ring-[#263a55]"
                placeholder="Search employee, date, department, or summary"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setReportPage(1);
                }}
              />
            </div>
            <Select
              aria-label="Filter reports by status"
              className="w-full min-[820px]:w-44"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter);
                setReportPage(1);
              }}
            >
              <option value="ALL">All statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="DRAFT">Drafts</option>
            </Select>
            <div className="text-sm font-semibold text-[#64748b] dark:text-muted-foreground min-[820px]:min-w-28 min-[820px]:text-right">
              {totalCount} report
              {totalCount === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div
          className="reference-paginated-viewport"
          data-pagination-loading={
            isRefreshing && reports.length > 0 ? "true" : undefined
          }
          aria-busy={isRefreshing}
        >
          {isRefreshing && reports.length === 0 ? (
            <div className="p-3">
              <EmptyReferenceState>Loading reports...</EmptyReferenceState>
            </div>
          ) : reports.length === 0 ? (
            <div className="p-3">
              <EmptyReferenceState>
                No reports match the current filters.
              </EmptyReferenceState>
            </div>
          ) : (
            <div className="divide-y divide-[#e5eaf2] dark:divide-[#263a55]">
              {reports.map((report) => (
                <article
                  key={report.id}
                  className="reference-admin-report-row-grid"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-start gap-3">
                      <ReportOwnerAvatar report={report} />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <h2 className="truncate text-sm font-semibold text-[#0f172a] dark:text-foreground">
                            {report.user.name ??
                              report.user.email ??
                              "Unknown employee"}
                          </h2>
                          <ReportStatusBadge
                            status={
                              report.status === "SUBMITTED"
                                ? "Submitted"
                                : "Draft"
                            }
                          />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748b] dark:text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {formatReportDate(report.reportDate)}
                          </span>
                          <span>{departmentLabel(report)}</span>
                          <span>{workLocationLabel(report.workLocation)}</span>
                        </div>
                        <p className="mt-2 line-clamp-2 break-words text-sm leading-5 text-[#475569] dark:text-muted-foreground">
                          {report.summary.trim() || "No summary recorded."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <ReportCount
                    label="Activities"
                    value={report._count.activities}
                  />
                  <div className="grid grid-cols-2 gap-2 text-xs text-[#64748b] dark:text-muted-foreground min-[860px]:block min-[860px]:space-y-1">
                    <ReportCount
                      label="Comments"
                      value={report._count.comments}
                    />
                    <ReportCount
                      label="Edits"
                      value={report._count.revisions}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-9 justify-center min-[860px]:w-28"
                    disabled={Boolean(deletingReportId)}
                    onClick={() => void deleteReport(report)}
                  >
                    {deletingReportId === report.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    {deletingReportId === report.id ? "Deleting" : "Delete"}
                  </Button>
                </article>
              ))}
            </div>
          )}
        </div>
        <PaginationControls
          className="reference-paginated-footer px-3 pb-3 pt-5"
          page={currentReportPage}
          pageSize={reportPageSize}
          pageSizeMenuPlacement="top"
          totalItems={totalCount}
          itemLabel="managed reports"
          isLoading={isRefreshing}
          onPageChange={changeReportPage}
          onPageSizeChange={changeReportPageSize}
        />
      </section>
      <FixedToast message={message} onDismiss={() => setMessage(null)} />
    </>
  );
}

function ReportOwnerAvatar({ report }: { report: AdminManagedReport }) {
  const name = report.user.name ?? report.user.email ?? "Unknown";

  return (
    <div
      className="h-10 w-10 shrink-0 rounded-full bg-[#2563eb] bg-cover bg-center text-center text-sm font-semibold leading-10 text-white"
      style={
        report.user.image
          ? { backgroundImage: `url("${report.user.image}")` }
          : undefined
      }
      aria-hidden="true"
    >
      {report.user.image ? null : initials(name)}
    </div>
  );
}

function ReportCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase text-[#94a3b8]">
        {label}
      </div>
      <div className="text-sm font-semibold text-[#0f172a] dark:text-foreground">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function departmentLabel(report: AdminManagedReport) {
  const departments =
    report.user.departments
      ?.filter((membership) => membership.role === "EMPLOYEE")
      .map((membership) => membership.department?.name)
      .filter(Boolean) ?? [];

  return departments.length > 0 ? departments.join(", ") : "No department";
}

function formatReportDate(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
