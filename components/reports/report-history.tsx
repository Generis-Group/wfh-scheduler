"use client";

import { CheckCircle2, CircleAlert, Clock3, Edit3, ListChecks } from "lucide-react";

import { EmptyReferenceState, ReferenceAppShell, ReferenceBadge, ReferencePanel } from "@/components/reports/reference-shell";
import { cn, titleCase } from "@/lib/utils";

type HistoryReport = {
  id: string;
  reportDate: string | Date;
  status: "DRAFT" | "SUBMITTED";
  workLocation: string;
  summary: string;
  blockers: string;
  submittedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  activities: Array<{ id: string }>;
  revisions: Array<{ id: string; createdAt: string | Date; editedBy?: { name?: string | null; email?: string | null } | null }>;
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
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return (toDate(value) ?? new Date()).toISOString().slice(0, 10);
}

function dayEnd(value: string | Date) {
  return new Date(`${dateInputValue(value)}T23:59:59.999`);
}

function formatReportDate(value: string | Date) {
  const date = toDate(value) ?? new Date();
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
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

function isLate(report: HistoryReport) {
  const submittedAt = toDate(report.submittedAt);
  return Boolean(submittedAt && submittedAt > dayEnd(report.reportDate));
}

function editedAfterDate(report: HistoryReport) {
  const updatedAt = toDate(report.updatedAt);
  return Boolean(updatedAt && updatedAt > dayEnd(report.reportDate));
}

function statusTone(report: HistoryReport): "green" | "orange" | "neutral" {
  if (editedAfterDate(report) || isLate(report) || report.status === "DRAFT") {
    return "orange";
  }

  return report.status === "SUBMITTED" ? "green" : "neutral";
}

export function ReportHistory({
  reports,
  userName,
  userRole
}: {
  reports: HistoryReport[];
  userName?: string | null;
  userRole?: string | null;
}) {
  return (
    <ReferenceAppShell active="history" variant="employee" userName={userName} userRole={userRole}>
      <main className="w-full px-[clamp(16px,2vw,34px)] pb-8 pt-8">
        <div className="mb-5">
          <h1 className="text-[26px] font-semibold tracking-normal text-[#0f172a]">Report History</h1>
          <p className="mt-2 text-sm text-[#64748b]">Review past submissions, later edits, blockers, and included activity counts.</p>
        </div>

        <ReferencePanel className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed text-sm">
              <thead className="border-b border-[#e2e8f0] bg-white text-left text-xs font-semibold text-[#475569]">
                <tr>
                  <th className="w-[16%] px-5 py-4">Report Date</th>
                  <th className="w-[13%] px-2 py-4">Status</th>
                  <th className="w-[13%] px-2 py-4">Work Location</th>
                  <th className="w-[16%] px-2 py-4">Submitted</th>
                  <th className="w-[14%] px-2 py-4">Flags</th>
                  <th className="px-2 py-4">Summary Preview</th>
                  <th className="w-[11%] px-5 py-4 text-right">Activities</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8">
                      <EmptyReferenceState>No report history yet.</EmptyReferenceState>
                    </td>
                  </tr>
                ) : (
                  reports.map((report) => {
                    const late = isLate(report);
                    const edited = editedAfterDate(report);

                    return (
                      <tr key={report.id} className="bg-white hover:bg-[#f8fafc]">
                        <td className="px-5 py-4 font-semibold text-[#0f172a]">{formatReportDate(report.reportDate)}</td>
                        <td className="px-2 py-4">
                          <ReferenceBadge tone={statusTone(report)}>{titleCase(report.status)}</ReferenceBadge>
                        </td>
                        <td className="px-2 py-4 text-[#334155]">{titleCase(report.workLocation)}</td>
                        <td className="px-2 py-4 text-[#334155]">{formatTimestamp(report.submittedAt)}</td>
                        <td className="px-2 py-4">
                          <div className="flex flex-wrap gap-2">
                            {edited ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#ea580c]">
                                <Edit3 className="h-3.5 w-3.5" />
                                Edited
                              </span>
                            ) : null}
                            {late ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#ea580c]">
                                <Clock3 className="h-3.5 w-3.5" />
                                Late
                              </span>
                            ) : null}
                            {report.blockers ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#dc2626]">
                                <CircleAlert className="h-3.5 w-3.5" />
                                Blocker
                              </span>
                            ) : null}
                            {!edited && !late && !report.blockers ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#16a34a]">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Clear
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2 py-4">
                          <div className="truncate text-[#334155]">{report.summary || "No summary entered."}</div>
                          <div className={cn("mt-1 text-xs", report.revisions.length ? "text-[#ea580c]" : "text-[#64748b]")}>
                            {report.revisions.length ? `${report.revisions.length} revision${report.revisions.length === 1 ? "" : "s"} recorded` : "No revisions recorded"}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right text-[#334155]">
                          <span className="inline-flex items-center justify-end gap-2">
                            <ListChecks className="h-4 w-4 text-[#64748b]" />
                            {report.activities.length}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </ReferencePanel>
      </main>
    </ReferenceAppShell>
  );
}
