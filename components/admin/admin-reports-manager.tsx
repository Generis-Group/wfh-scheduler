"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Loader2, Search, Trash2 } from "lucide-react";

import { EmptyReferenceState } from "@/components/reports/reference-shell";
import { ReportStatusBadge } from "@/components/reports/report-ui";
import { Button } from "@/components/ui/button";
import { FixedToast } from "@/components/ui/fixed-toast";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { markServerDataStale } from "@/lib/client-cache-invalidation";
import { cn, initials } from "@/lib/utils";

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

export function AdminReportsManager({
  initialReports,
}: {
  initialReports: AdminManagedReport[];
}) {
  const [reports, setReports] = useState(initialReports);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();

    return reports.filter((report) => {
      if (statusFilter !== "ALL" && report.status !== statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        report.user.name,
        report.user.email,
        report.summary,
        formatReportDate(report.reportDate),
        departmentLabel(report),
        report.workLocation,
        report.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [reports, search, statusFilter]);

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
      markServerDataStale();
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
      <section className="min-w-0 overflow-hidden rounded-[8px] bg-white shadow-[0_6px_18px_rgba(15,23,42,0.045)] ring-1 ring-[#e6ebf3] dark:bg-[#0f1b2a] dark:ring-[#1d2d43] min-[1024px]:flex min-[1024px]:h-full min-[1024px]:min-h-0 min-[1024px]:flex-col">
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
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select
              aria-label="Filter reports by status"
              className="w-full min-[820px]:w-44"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
            >
              <option value="ALL">All statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="DRAFT">Drafts</option>
            </Select>
            <div className="text-sm font-semibold text-[#64748b] dark:text-muted-foreground min-[820px]:min-w-28 min-[820px]:text-right">
              {filteredReports.length} report
              {filteredReports.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div className="min-h-0 min-[1024px]:flex-1 min-[1024px]:overflow-y-auto min-[1024px]:overscroll-contain min-[1024px]:[scrollbar-gutter:stable]">
          {filteredReports.length === 0 ? (
            <div className="p-3">
              <EmptyReferenceState>
                No reports match the current filters.
              </EmptyReferenceState>
            </div>
          ) : (
            <div className="divide-y divide-[#e5eaf2] dark:divide-[#263a55]">
              {filteredReports.map((report) => (
                <article
                  key={report.id}
                  className="grid min-w-0 gap-3 p-3 min-[860px]:grid-cols-[minmax(0,1fr)_160px_130px_auto] min-[860px]:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-start gap-3">
                      <ReportOwnerAvatar report={report} />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <h2 className="truncate text-sm font-semibold text-[#0f172a] dark:text-foreground">
                            {report.user.name ?? report.user.email ?? "Unknown employee"}
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
                        <p className="mt-2 line-clamp-2 break-words text-sm leading-5 text-[#475569] [overflow-wrap:anywhere] dark:text-muted-foreground">
                          {report.summary.trim() || "No summary recorded."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <ReportCount label="Activities" value={report._count.activities} />
                  <div className="grid grid-cols-2 gap-2 text-xs text-[#64748b] dark:text-muted-foreground min-[860px]:block min-[860px]:space-y-1">
                    <ReportCount label="Comments" value={report._count.comments} />
                    <ReportCount label="Edits" value={report._count.revisions} />
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

function workLocationLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatReportDate(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
