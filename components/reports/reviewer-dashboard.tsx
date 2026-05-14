"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleAlert,
  CircleHelp,
  Download,
  Edit3,
  Filter,
  Search,
  TriangleAlert,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyReferenceState, ReferenceAppShell, ReferenceBadge, ReferencePanel } from "@/components/reports/reference-shell";
import { cn, initials, titleCase } from "@/lib/utils";

type DashboardUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
};

type DashboardReport = {
  id: string;
  reportDate?: string | Date;
  status: "DRAFT" | "SUBMITTED";
  workLocation: string;
  summary: string;
  blockers: string;
  submittedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  activities: Array<{ id: string; title: string; source: string; selected: boolean }>;
  comments: Array<{ id: string; body: string; author: { name?: string | null; email?: string | null } }>;
  revisions: Array<{ id: string; createdAt: string | Date; editedBy: { name?: string | null; email?: string | null } }>;
};

type Row = {
  user: DashboardUser;
  report: DashboardReport | null;
};

type Metrics = {
  users: number;
  submitted: number;
  blockers: number;
  blockerTrend: Array<{ date: string; count: number }>;
  sourceMix: Array<{ source: string; count: number }>;
};

const rowsPerPage = 25;
const sourceColors = ["#2563eb", "#16a34a", "#f59e0b", "#8b5cf6"];

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

function formatReportDate(value?: string | Date) {
  const date = toDate(value) ?? new Date();
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    weekday: "short"
  }).formatToParts(date);
  const lookup = Object.fromEntries(formatted.map((part) => [part.type, part.value]));

  return `${lookup.month} ${lookup.day}, ${lookup.year} (${lookup.weekday})`;
}

function formatShortDate(value?: string | Date) {
  const date = toDate(value);

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
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

function dayEnd(value: string | Date) {
  return new Date(`${dateInputValue(value)}T23:59:59.999`);
}

function isLate(report: DashboardReport | null, date: string) {
  const submittedAt = toDate(report?.submittedAt);
  return Boolean(submittedAt && submittedAt > dayEnd(report?.reportDate ?? date));
}

function editedAfterDate(report: DashboardReport | null, date: string) {
  const updatedAt = toDate(report?.updatedAt);
  return Boolean(updatedAt && updatedAt > dayEnd(report?.reportDate ?? date));
}

function hasBlockers(report: DashboardReport | null) {
  return Boolean(report?.blockers?.trim());
}

function reportStatus(row: Row, date: string) {
  if (!row.report) {
    return "Missing";
  }

  if (editedAfterDate(row.report, date)) {
    return "Edited After Date";
  }

  if (isLate(row.report, date)) {
    return row.report.status === "SUBMITTED" ? "Submitted (Late)" : "Late";
  }

  return titleCase(row.report.status);
}

function statusTone(label: string): "green" | "orange" | "red" | "neutral" {
  if (label === "Missing") {
    return "red";
  }

  if (label.includes("Late") || label.includes("Edited")) {
    return "orange";
  }

  if (label === "Submitted") {
    return "green";
  }

  return "neutral";
}

function sourceLabel(source: string) {
  return titleCase(source);
}

function StatCard({
  icon,
  label,
  value,
  percent,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: number;
  percent: string;
  tone: "green" | "orange" | "red";
}) {
  const toneClass = {
    green: "text-[#16a34a]",
    orange: "text-[#ea580c]",
    red: "text-[#ef4444]"
  }[tone];

  return (
    <ReferencePanel className="flex min-h-[104px] items-center gap-5 p-5">
      <div className={cn("flex h-10 w-10 items-center justify-center", toneClass)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[#475569]">{label}</div>
        <div className="mt-1 text-2xl font-semibold text-[#0f172a]">{value}</div>
      </div>
      <div className="self-end text-sm text-[#64748b]">{percent}</div>
    </ReferencePanel>
  );
}

export function ReviewerDashboard({
  rows,
  metrics,
  date,
  userName,
  userRole,
  isPreview = false
}: {
  rows: Row[];
  metrics: Metrics;
  date: string;
  userName?: string | null;
  userRole?: string | null;
  isPreview?: boolean;
}) {
  const [items, setItems] = useState(rows);
  const [selectedId, setSelectedId] = useState(rows.find((row) => row.report)?.user.id ?? rows[0]?.user.id ?? "");
  const [commentBody, setCommentBody] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [locationFilter, setLocationFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((row) => {
      const status = reportStatus(row, date);
      const location = row.report?.workLocation ?? "MISSING";
      const employee = `${row.user.name ?? ""} ${row.user.email ?? ""}`.toLowerCase();
      const matchesSearch = !query || employee.includes(query);
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "MISSING" && !row.report) ||
        (statusFilter === "SUBMITTED" && row.report?.status === "SUBMITTED" && !status.includes("Late") && !status.includes("Edited")) ||
        (statusFilter === "DRAFT" && row.report?.status === "DRAFT") ||
        (statusFilter === "LATE" && status.includes("Late")) ||
        (statusFilter === "EDITED" && status.includes("Edited"));
      const matchesLocation = locationFilter === "ALL" || location === locationFilter;

      return matchesSearch && matchesStatus && matchesLocation;
    });
  }, [date, items, locationFilter, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filteredItems.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const selected = filteredItems.find((row) => row.user.id === selectedId) ?? filteredItems[0] ?? null;
  const total = filteredItems.length;

  const counts = useMemo(() => {
    const submitted = filteredItems.filter((row) => row.report?.status === "SUBMITTED").length;
    const missing = filteredItems.filter((row) => !row.report).length;
    const late = filteredItems.filter((row) => isLate(row.report, date) && !editedAfterDate(row.report, date)).length;
    const edited = filteredItems.filter((row) => editedAfterDate(row.report, date)).length;
    const blockers = filteredItems.filter((row) => hasBlockers(row.report)).length;

    return {
      submitted,
      missing,
      late,
      edited,
      blockers
    };
  }, [date, filteredItems]);

  const coverage = total ? Math.round((counts.submitted / total) * 100) : 0;
  const sourceMix = metrics.sourceMix.length ? metrics.sourceMix : [{ source: "No activity", count: 1 }];
  const blockerTrend = metrics.blockerTrend ?? [];

  function exportCsv() {
    const rows = filteredItems.map((row) => ({
      employee: row.user.name ?? row.user.email ?? "Unassigned employee",
      date: formatShortDate(row.report?.reportDate ?? date),
      status: reportStatus(row, date),
      workLocation: row.report ? titleCase(row.report.workLocation) : "",
      submittedAt: formatTimestamp(row.report?.submittedAt),
      lastEdited: formatTimestamp(row.report?.updatedAt),
      blockers: hasBlockers(row.report) ? "Yes" : "No",
      activities: row.report?.activities.filter((activity) => activity.selected).length ?? 0
    }));
    const headers = ["employee", "date", "status", "workLocation", "submittedAt", "lastEdited", "blockers", "activities"];
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => `"${String(row[header as keyof typeof row]).replace(/"/g, '""')}"`)
          .join(",")
      )
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `generis-reports-${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${rows.length} visible rows.`);
  }

  async function addComment() {
    if (!selected?.report || !commentBody.trim()) {
      return;
    }

    const selectedReport = selected.report;

    if (isPreview) {
      setItems((current) =>
        current.map((row) => {
          if (!row.report || row.report.id !== selectedReport.id) {
            return row;
          }

          return {
            ...row,
            report: {
              ...row.report,
              comments: [
                ...row.report.comments,
                {
                  id: `comment-${Date.now()}`,
                  body: commentBody.trim(),
                  author: { name: userName || "Admin User" }
                }
              ]
            }
          };
        })
      );
      setCommentBody("");
      return;
    }

    const response = await fetch(`/api/reports/${selected.report.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentBody })
    });

    if (!response.ok) {
      return;
    }

    const { report } = await response.json();
    setItems((current) => current.map((row) => (row.report?.id === report.id ? { ...row, report } : row)));
    setCommentBody("");
  }

  return (
    <ReferenceAppShell active="review" variant="admin" userName={userName} userRole={userRole ?? "Reviewer"} preview={isPreview}>
      <main className="w-full px-[clamp(16px,2vw,30px)] pb-8 pt-5">
        <ReferencePanel className="mb-5 grid gap-5 p-5 md:grid-cols-[minmax(220px,280px)_minmax(200px,280px)_minmax(200px,280px)_1fr]">
          <div>
            <div className="mb-2 text-xs font-medium text-[#64748b]">Report Date</div>
            <label className="relative flex h-10 items-center gap-3 rounded-[6px] border border-[#d9e1ec] bg-white px-3 text-sm font-medium text-[#0f172a]">
              <CalendarDays className="h-4 w-4 text-[#475569]" />
              <span className="pointer-events-none absolute left-10">{formatReportDate(date)}</span>
              <Input
                type="date"
                value={dateInputValue(date)}
                className="h-full border-0 bg-transparent opacity-0"
                onChange={(event) => {
                  window.location.href = isPreview ? `/preview/admin?date=${event.target.value}` : `/review?date=${event.target.value}`;
                }}
                aria-label="Report date"
              />
            </label>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-[#64748b]">Team</div>
            <Select
              className="h-10 border-[#d9e1ec]"
              onChange={() => {
                setFilterOpen(false);
                setNotice("Team filtering will apply once team data is connected.");
              }}
            >
              <option>All Teams</option>
            </Select>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-[#64748b]">Work Location</div>
            <Select
              value={locationFilter}
              className="h-10 border-[#d9e1ec]"
              onChange={(event) => {
                setLocationFilter(event.target.value);
                setPage(1);
                setFilterOpen(false);
                setNotice(null);
              }}
            >
              <option value="ALL">All Locations</option>
              <option value="OFFICE">Office</option>
              <option value="WFH">WFH</option>
              <option value="HYBRID">Hybrid</option>
              <option value="PTO">PTO</option>
              <option value="OUT_OF_OFFICE">Out of office</option>
              <option value="UNKNOWN">Unspecified</option>
            </Select>
          </div>
          <div className="flex items-end justify-end">
            <Button
              variant="outline"
              className="h-11 border-[#d9e1ec]"
              onClick={exportCsv}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </ReferencePanel>

        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 min-[1180px]:grid-cols-[1fr_1fr_1fr_1fr_1fr_1.45fr]">
          <StatCard icon={<CheckCircle2 className="h-7 w-7" />} label="Submitted" value={counts.submitted} percent={total ? `${coverage}%` : "-"} tone="green" />
          <StatCard icon={<CircleHelp className="h-7 w-7" />} label="Missing" value={counts.missing} percent={total ? `${Math.round((counts.missing / total) * 100)}%` : "-"} tone="orange" />
          <StatCard icon={<ClockIcon />} label="Late (not edited)" value={counts.late} percent={total ? `${Math.round((counts.late / total) * 100)}%` : "-"} tone="orange" />
          <StatCard icon={<Edit3 className="h-7 w-7" />} label="Edited after date" value={counts.edited} percent={total ? `${Math.round((counts.edited / total) * 100)}%` : "-"} tone="orange" />
          <StatCard icon={<TriangleAlert className="h-7 w-7" />} label="With blockers" value={counts.blockers} percent={total ? `${Math.round((counts.blockers / total) * 100)}%` : "-"} tone="red" />
          <ReferencePanel className="min-h-[104px] p-5">
            <div className="text-sm font-medium text-[#475569]">Submission coverage</div>
            <div className="mt-1 flex items-end justify-between">
              <div className="text-2xl font-semibold text-[#0f172a]">
                {counts.submitted} / {total}
              </div>
              <div className="text-sm font-semibold text-[#16a34a]">{coverage}%</div>
            </div>
            <div className="mt-4 h-3 rounded-full bg-[#e2e8f0]">
              <div className="h-3 rounded-full bg-[#2563eb]" style={{ width: `${coverage}%` }} />
            </div>
          </ReferencePanel>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ReferencePanel className="min-h-[220px] p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#0f172a]">Activity Source Mix</h2>
                <p className="mt-1 text-xs text-[#64748b]">Selected activities by imported source.</p>
              </div>
            </div>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sourceMix} dataKey="count" nameKey="source" innerRadius={42} outerRadius={68} paddingAngle={3}>
                    {sourceMix.map((item, index) => (
                      <Cell key={item.source} fill={sourceColors[index % sourceColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, sourceLabel(String(name))]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#475569]">
              {metrics.sourceMix.length ? (
                metrics.sourceMix.map((item, index) => (
                  <span key={item.source} className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sourceColors[index % sourceColors.length] }} />
                    {sourceLabel(item.source)} ({item.count})
                  </span>
                ))
              ) : (
                <span>No selected activity yet.</span>
              )}
            </div>
          </ReferencePanel>

          <ReferencePanel className="min-h-[220px] p-5">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-[#0f172a]">Blocker Trend</h2>
              <p className="mt-1 text-xs text-[#64748b]">Reports with blockers over the last seven report dates.</p>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={blockerTrend}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(value) => String(value).slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                  <Tooltip labelFormatter={(value) => `Date: ${value}`} />
                  <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ReferencePanel>
        </div>

        <div className="grid gap-5 min-[1180px]:grid-cols-[minmax(0,1fr)_400px] min-[1500px]:grid-cols-[minmax(0,1fr)_420px]">
          <ReferencePanel className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e8f0] p-4">
              <div className="relative w-full max-w-[340px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
                <Input
                  className="h-10 border-[#d9e1ec] pl-10"
                  placeholder="Search employees..."
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Button
                variant="outline"
                className="h-10 border-[#d9e1ec]"
                onClick={() => {
                  setFilterOpen((open) => !open);
                  setNotice(null);
                }}
              >
                <Filter className="mr-2 h-4 w-4" />
                Filters
              </Button>
            </div>
            {filterOpen || notice ? (
              <div className="border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-sm text-[#475569]">
                {notice ?? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium text-[#334155]">Status</span>
                    <Select
                      value={statusFilter}
                      className="h-9 w-44 border-[#d9e1ec]"
                      onChange={(event) => {
                        setStatusFilter(event.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="ALL">All statuses</option>
                      <option value="SUBMITTED">Submitted</option>
                      <option value="DRAFT">Draft</option>
                      <option value="MISSING">Missing</option>
                      <option value="LATE">Late</option>
                      <option value="EDITED">Edited after date</option>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setStatusFilter("ALL");
                        setLocationFilter("ALL");
                        setSearch("");
                        setPage(1);
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] table-fixed text-[13px] min-[1500px]:text-sm">
                <thead className="border-b border-[#e2e8f0] bg-white text-left text-xs font-semibold text-[#475569]">
                  <tr>
                    <th className="w-12 px-5 py-4">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-[#cbd5e1] accent-[#2563eb]"
                        aria-label="Select all employees"
                        onChange={() => setNotice("Bulk selection will be available once employee actions are connected.")}
                      />
                    </th>
                    <th className="w-[19%] px-2 py-4">Employee</th>
                    <th className="w-[10%] px-2 py-4">Report Date</th>
                    <th className="w-[14%] px-2 py-4">Status</th>
                    <th className="w-[11%] px-2 py-4">Work Location</th>
                    <th className="w-[11%] px-2 py-4">Submitted At</th>
                    <th className="w-[11%] px-2 py-4">Last Edited</th>
                    <th className="w-[8%] px-2 py-4">Edited After Date</th>
                    <th className="w-[7%] px-2 py-4">Blockers</th>
                    <th className="w-[7%] px-2 py-4">Activities</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-5 py-8">
                        <EmptyReferenceState>No employee reports for this date yet.</EmptyReferenceState>
                      </td>
                    </tr>
                  ) : (
                    pageItems.map((row) => {
                      const status = reportStatus(row, date);
                      const selectedRow = selected?.user.id === row.user.id;
                      const includedCount = row.report?.activities.filter((activity) => activity.selected).length ?? 0;

                      return (
                        <tr
                          key={row.user.id}
                          className={cn("cursor-pointer bg-white hover:bg-[#f8fafc]", selectedRow && "bg-[#f3f8ff] outline outline-1 outline-[#bfdbfe]")}
                          onClick={() => setSelectedId(row.user.id)}
                        >
                          <td className="px-5 py-4">
                            <input type="checkbox" checked={selectedRow} readOnly className="h-4 w-4 rounded border-[#cbd5e1] accent-[#2563eb]" />
                          </td>
                          <td className="px-2 py-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#243552] text-xs font-semibold text-white min-[1500px]:h-9 min-[1500px]:w-9">
                                {initials(row.user.name ?? row.user.email)}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-[#0f172a]">{row.user.name ?? row.user.email ?? "Unassigned employee"}</div>
                                <div className="text-xs text-[#64748b]">{titleCase(row.user.role)}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-4 text-[#334155]">{formatShortDate(row.report?.reportDate ?? date)}</td>
                          <td className="px-2 py-4">
                            <ReferenceBadge tone={statusTone(status)}>{status}</ReferenceBadge>
                          </td>
                          <td className="truncate px-2 py-4 text-[#334155]">{row.report ? titleCase(row.report.workLocation) : "-"}</td>
                          <td className={cn("px-2 py-4", isLate(row.report, date) ? "font-semibold text-[#ea580c]" : "text-[#334155]")}>{formatTimestamp(row.report?.submittedAt)}</td>
                          <td className={cn("px-2 py-4", editedAfterDate(row.report, date) ? "font-semibold text-[#ea580c]" : "text-[#334155]")}>{formatTimestamp(row.report?.updatedAt)}</td>
                          <td className="px-2 py-4 text-center">
                            {editedAfterDate(row.report, date) ? <Edit3 className="mx-auto h-5 w-5 text-[#ea580c]" /> : <span className="text-[#64748b]">-</span>}
                          </td>
                          <td className="px-2 py-4 text-center">
                            {hasBlockers(row.report) ? <TriangleAlert className="mx-auto h-5 w-5 text-[#ef4444]" /> : <span className="text-[#64748b]">-</span>}
                          </td>
                          <td className="px-2 py-4 text-center text-[#334155]">{includedCount}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e2e8f0] p-4 text-sm text-[#64748b]">
              <span>Showing {pageItems.length} of {filteredItems.length} employees</span>
              <div className="flex items-center gap-4">
                <span>Rows per page:</span>
                <Select className="h-9 w-20 border-[#d9e1ec]">
                  <option>25</option>
                </Select>
                <span>
                  {filteredItems.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1}-{Math.min(currentPage * rowsPerPage, filteredItems.length)} of {filteredItems.length}
                </span>
                <div className="flex items-center gap-2">
                  <button aria-label="First page" onClick={() => setPage(1)} disabled={currentPage === 1}>
                    <ChevronsLeft className="h-4 w-4" />
                  </button>
                  <button aria-label="Previous page" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-[#93c5fd] text-[#2563eb]">{currentPage}</span>
                  <button aria-label="Next page" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount}>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button aria-label="Last page" onClick={() => setPage(pageCount)} disabled={currentPage === pageCount}>
                    <ChevronsRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </ReferencePanel>

          <ReportDetailPanel
            row={selected}
            date={date}
            commentBody={commentBody}
            setCommentBody={setCommentBody}
            addComment={addComment}
          />
        </div>
      </main>
    </ReferenceAppShell>
  );
}

function ClockIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReportDetailPanel({
  row,
  date,
  commentBody,
  setCommentBody,
  addComment
}: {
  row: Row | null;
  date: string;
  commentBody: string;
  setCommentBody: (value: string) => void;
  addComment: () => Promise<void>;
}) {
  if (!row) {
    return (
      <ReferencePanel className="p-5">
        <EmptyReferenceState>Select an employee report to review details.</EmptyReferenceState>
      </ReferencePanel>
    );
  }

  const report = row.report;
  const includedActivities = report?.activities.filter((activity) => activity.selected) ?? [];

  return (
    <ReferencePanel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#e2e8f0] p-5">
        <h2 className="text-lg font-semibold text-[#0f172a]">
          {row.user.name ?? row.user.email ?? "Employee"} - {formatReportDate(report?.reportDate ?? date)}
        </h2>
        <X className="h-5 w-5 text-[#64748b]" />
      </div>

      <div className="space-y-3 p-4">
        <div className="rounded-[8px] border border-[#e2e8f0] p-4">
          <h3 className="mb-4 text-sm font-semibold text-[#0f172a]">Report Details</h3>
          {report ? (
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <Detail label="Status" value={<ReferenceBadge tone={statusTone(reportStatus(row, date))}>{reportStatus(row, date)}</ReferenceBadge>} />
              <Detail label="Last Edited" value={formatTimestamp(report.updatedAt)} />
              <Detail label="Work Location" value={titleCase(report.workLocation)} />
              <Detail label="Edited After Date" value={editedAfterDate(report, date) ? "Yes" : "-"} />
              <Detail label="Submitted At" value={formatTimestamp(report.submittedAt)} />
              <Detail label="Activities Included" value={includedActivities.length.toString()} />
            </div>
          ) : (
            <EmptyReferenceState>No submitted report for this employee.</EmptyReferenceState>
          )}
        </div>

        <div className="rounded-[8px] border border-[#e2e8f0] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#0f172a]">Summary</h3>
          <p className="whitespace-pre-wrap text-sm leading-6 text-[#334155]">{report?.summary || "No summary yet."}</p>
        </div>

        <div className="rounded-[8px] border border-[#e2e8f0] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#0f172a]">Blockers</h3>
          {report?.blockers ? (
            <div className="flex gap-2 text-sm leading-6 text-[#334155]">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#ef4444]" />
              <span className="whitespace-pre-wrap">{report.blockers}</span>
            </div>
          ) : (
            <p className="text-sm text-[#64748b]">No blockers recorded.</p>
          )}
        </div>

        <div className="rounded-[8px] border border-[#e2e8f0] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#0f172a]">Included Activities ({includedActivities.length})</h3>
          <div className="flex flex-wrap gap-2">
            {includedActivities.length === 0 ? (
              <span className="text-sm text-[#64748b]">No activities included.</span>
            ) : (
              [...new Set(includedActivities.map((activity) => activity.source))].map((source) => (
                <ReferenceBadge key={source} tone="neutral">{sourceLabel(source)}</ReferenceBadge>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[8px] border border-[#e2e8f0] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#0f172a]">Reviewer Comments</h3>
          <div className="mb-3 space-y-2">
            {report?.comments.length ? (
              report.comments.map((comment) => (
                <div key={comment.id} className="rounded-[6px] bg-[#f8fafc] p-3 text-sm text-[#334155]">
                  <p>{comment.body}</p>
                  <p className="mt-1 text-xs text-[#64748b]">{comment.author.name ?? comment.author.email ?? "Admin"}</p>
                </div>
              ))
            ) : null}
          </div>
          <div className="flex gap-2">
            <Input
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder="Add a comment visible to the employee..."
              className="h-10 border-[#d9e1ec]"
              disabled={!report}
            />
            <Button className="h-10 bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={addComment} disabled={!report}>
              Add Comment
            </Button>
          </div>
        </div>

        <div className="rounded-[8px] border border-[#e2e8f0] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#0f172a]">Revision History</h3>
          <div className="space-y-4">
            {report?.revisions.length ? (
              report.revisions.map((revision) => (
                <div key={revision.id} className="grid grid-cols-[24px_1fr_auto] gap-3 text-sm">
                  <Edit3 className="h-4 w-4 text-[#ea580c]" />
                  <div>
                    <p className="font-medium text-[#334155]">Edited after date</p>
                    <p className="mt-1 text-xs text-[#64748b]">Report content was updated after the original report day.</p>
                  </div>
                  <div className="text-right text-xs text-[#64748b]">
                    <div>{formatTimestamp(revision.createdAt)}</div>
                    <div>{revision.editedBy.name ?? revision.editedBy.email ?? "User"}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="grid grid-cols-[24px_1fr_auto] gap-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-[#16a34a]" />
                <div>
                  <p className="font-medium text-[#334155]">{report ? "Submitted" : "No report"}</p>
                  <p className="mt-1 text-xs text-[#64748b]">{report ? "No revisions recorded." : "Nothing to show yet."}</p>
                </div>
                <div className="text-right text-xs text-[#64748b]">{formatTimestamp(report?.submittedAt)}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ReferencePanel>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-[#64748b]">{label}</div>
      <div className="mt-1 text-sm font-medium text-[#334155]">{value}</div>
    </div>
  );
}
