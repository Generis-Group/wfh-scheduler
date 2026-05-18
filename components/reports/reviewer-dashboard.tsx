"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  Clock3,
  Download,
  Edit3,
  FileText,
  Mail,
  MessageSquare,
  Search,
  TriangleAlert
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";

import { EmptyReferenceState, ReferenceAppShell } from "@/components/reports/reference-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dateOnlyDisplayDate, dateOnlyString } from "@/lib/date-only";
import { cn, initials, titleCase } from "@/lib/utils";

type DashboardUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
  status?: string | null;
};

type DashboardActivity = {
  id: string;
  title: string;
  source: string;
  selected: boolean;
  status?: string | null;
  durationMinutes?: number | null;
  employeeNote?: string | null;
  sourceUrl?: string | null;
};

type DashboardComment = {
  id: string;
  body: string;
  createdAt?: string | Date | null;
  author: { name?: string | null; email?: string | null };
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
  activities: DashboardActivity[];
  comments: DashboardComment[];
  readReceipts?: Array<{ reviewerId: string; readAt: string | Date }>;
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

function formatReportDate(value?: string | Date) {
  const date = dateOnlyDisplayDate(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    weekday: "short"
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${lookup.month} ${lookup.day}, ${lookup.year} (${lookup.weekday})`;
}

function formatShortDate(value?: string | Date) {
  const date = value ? dateOnlyDisplayDate(value) : null;

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
    year: "numeric",
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
  return Boolean(
    report?.revisions.some((revision) => {
      const editedAt = toDate(revision.createdAt);
      return Boolean(editedAt && editedAt > dayEnd(report.reportDate ?? date));
    })
  );
}

function hasBlockers(report: DashboardReport | null) {
  return Boolean(report?.blockers?.trim());
}

function blockerItems(report: DashboardReport | null) {
  return (report?.blockers ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function includedActivities(report: DashboardReport | null) {
  return report?.activities.filter((activity) => activity.selected) ?? [];
}

function reportStatus(row: Row, date: string) {
  if (!row.report) {
    return "Missing";
  }

  if (row.report.status === "DRAFT") {
    return "Draft";
  }

  if (isLate(row.report, date)) {
    return "Submitted";
  }

  return "Submitted";
}

function statusClass(status: string) {
  if (status === "Submitted") {
    return "bg-[#e7f8ee] text-[#15803d] dark:bg-emerald-400/15 dark:text-emerald-200";
  }

  if (status === "Draft") {
    return "bg-[#fff3db] text-[#b45309] dark:bg-amber-400/15 dark:text-amber-200";
  }

  return "bg-[#fdecee] text-[#dc2626] dark:bg-red-400/15 dark:text-red-200";
}

function sourceLabel(source: string) {
  if (source === "GOOGLE_CALENDAR") {
    return "Calendar";
  }

  if (source === "GOOGLE_TASKS") {
    return "Tasks";
  }

  return titleCase(source);
}

function formatDuration(minutes?: number | null) {
  if (!minutes) {
    return "-";
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours ? (remaining ? `${hours}h ${remaining}m` : `${hours}h`) : `${remaining}m`;
}

function reportReadReceipt(report: DashboardReport | null, reviewerId?: string | null) {
  if (!report || !reviewerId) {
    return null;
  }

  return report.readReceipts?.find((receipt) => receipt.reviewerId === reviewerId) ?? null;
}

function reportChangedAt(report: DashboardReport | null) {
  return toDate(report?.updatedAt) ?? toDate(report?.submittedAt);
}

function isUnreadForReviewer(report: DashboardReport | null, reviewerId?: string | null) {
  if (!report) {
    return false;
  }

  const receipt = reportReadReceipt(report, reviewerId);
  const changedAt = reportChangedAt(report);
  const readAt = toDate(receipt?.readAt);

  if (!receipt || !readAt) {
    return true;
  }

  return Boolean(changedAt && readAt < changedAt);
}

function sourceIcon(source: string) {
  const baseClass = "h-4 w-4";

  if (source === "JIRA") {
    return <FileText className={cn(baseClass, "text-[#2563eb]")} />;
  }

  if (source === "GOOGLE_CALENDAR") {
    return <CalendarDays className={cn(baseClass, "text-[#16a34a]")} />;
  }

  if (source === "GOOGLE_TASKS") {
    return <CheckCircle2 className={cn(baseClass, "text-[#2563eb]")} />;
  }

  return <MessageSquare className={cn(baseClass, "text-[#8b5cf6]")} />;
}

function reportSubtitle(row: Row | null, reviewerId?: string | null) {
  if (!row?.report) {
    return "No report submitted";
  }

  const unread = isUnreadForReviewer(row.report, reviewerId);

  if (unread && reportReadReceipt(row.report, reviewerId)) {
    return "Unread since last edit";
  }

  if (unread) {
    return "Unread";
  }

  return "Read";
}

function dashboardFlags(row: Row, date: string) {
  if (!row.report) {
    return [];
  }

  const flags: Array<{ key: string; icon: ReactNode; label: string }> = [];

  if (hasBlockers(row.report)) {
    flags.push({ key: "blockers", icon: <TriangleAlert className="h-4 w-4" />, label: "Blockers" });
  }

  if (row.report.activities.length > 0) {
    flags.push({ key: "activities", icon: <FileText className="h-4 w-4" />, label: "Activity" });
  }

  if (editedAfterDate(row.report, date)) {
    flags.push({ key: "edited", icon: <Edit3 className="h-4 w-4" />, label: "Late edit" });
  }

  if (isLate(row.report, date)) {
    flags.push({ key: "late", icon: <Clock3 className="h-4 w-4" />, label: "Late" });
  }

  return flags;
}

export function ReviewerDashboard({
  rows,
  metrics: _metrics,
  date,
  userName,
  userEmail,
  userRole,
  userStatus,
  timezone,
  mustChangePassword,
  reviewerId,
  isPreview = false
}: {
  rows: Row[];
  metrics: Metrics;
  date: string;
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  userStatus?: string | null;
  timezone?: string | null;
  mustChangePassword?: boolean;
  reviewerId?: string | null;
  isPreview?: boolean;
}) {
  const [items, setItems] = useState(rows);
  const [activeReportUserId, setActiveReportUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("EMPLOYEES");
  const [locationFilter, setLocationFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((row) => {
      const employee = `${row.user.name ?? ""} ${row.user.email ?? ""}`.toLowerCase();
      const matchesSearch = !query || employee.includes(query);
      const matchesGroup =
        (groupFilter === "EMPLOYEES" && row.user.role === "EMPLOYEE") ||
        (groupFilter === "SUBMITTED" && row.report?.status === "SUBMITTED") ||
        (groupFilter === "MISSING" && !row.report) ||
        (groupFilter === "BLOCKERS" && hasBlockers(row.report));
      const matchesLocation = locationFilter === "ALL" || row.report?.workLocation === locationFilter;

      return matchesSearch && matchesGroup && matchesLocation;
    });
  }, [groupFilter, items, locationFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeRow = activeReportUserId ? items.find((row) => row.user.id === activeReportUserId) ?? null : null;
  const total = filteredItems.length;
  const submitted = filteredItems.filter((row) => row.report?.status === "SUBMITTED").length;
  const missing = filteredItems.filter((row) => !row.report).length;
  const blockers = filteredItems.filter((row) => hasBlockers(row.report)).length;
  const lateEdits = filteredItems.filter((row) => editedAfterDate(row.report, date) || isLate(row.report, date)).length;
  const coverage = total ? Math.round((submitted / total) * 100) : 0;

  function goToDate(nextDate: string) {
    if (!nextDate) {
      return;
    }

    window.location.href = isPreview ? `/preview/admin?date=${nextDate}` : `/review?date=${nextDate}`;
  }

  function downloadCsv() {
    const exportRows = filteredItems.map((row) => ({
      employee: row.user.name ?? row.user.email ?? "Unassigned employee",
      email: row.user.email ?? "",
      date: formatShortDate(row.report?.reportDate ?? date),
      status: reportStatus(row, date),
      workLocation: row.report ? titleCase(row.report.workLocation) : "",
      submittedAt: formatTimestamp(row.report?.submittedAt),
      lastEdited: formatTimestamp(row.report?.updatedAt),
      blockers: hasBlockers(row.report) ? "Yes" : "No",
      activities: includedActivities(row.report).length
    }));
    const headers = ["employee", "email", "date", "status", "workLocation", "submittedAt", "lastEdited", "blockers", "activities"];
    const csv = [
      headers.join(","),
      ...exportRows.map((row) =>
        headers
          .map((header) => `"${String(row[header as keyof typeof row]).replace(/"/g, '""')}"`)
          .join(",")
      )
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `generis-review-${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${filteredItems.length} row${filteredItems.length === 1 ? "" : "s"}.`);
  }

  async function sendEmailDigest() {
    setNotice(null);

    if (isPreview) {
      setNotice(`Preview email digest prepared for ${filteredItems.length} visible row${filteredItems.length === 1 ? "" : "s"}.`);
      return;
    }

    setIsSendingDigest(true);
    const response = await fetch("/api/review/email-digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        filters: {
          groupFilter,
          locationFilter,
          search
        }
      })
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setNotice(body.error ?? "Unable to send email digest.");
      setIsSendingDigest(false);
      return;
    }

    const recipients = body.emailRun?.recipientEmails?.length ?? 0;
    setNotice(body.skipped ? "Digest was skipped because it was already sent or had no recipients." : `Email digest sent to ${recipients} reviewer/admin recipient${recipients === 1 ? "" : "s"}.`);
    setIsSendingDigest(false);
  }

  async function setReadState(row: Row, read: boolean) {
    if (!row.report) {
      return;
    }

    if (isPreview) {
      setItems((current) => setLocalReadReceipt(current, row.report!.id, reviewerId ?? "preview-admin", read));
      setNotice(read ? "Report marked as read." : "Report marked unread.");
      return;
    }

    const response = await fetch(`/api/reports/${row.report.id}/read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read })
    });

    if (!response.ok) {
      setNotice(read ? "Unable to mark report as read." : "Unable to mark report unread.");
      return;
    }

    const { report } = await response.json();
    setItems((current) => current.map((item) => (item.report?.id === report.id ? { ...item, report } : item)));
    setNotice(read ? "Report marked as read." : "Report marked unread.");
  }

  async function addComment(row: Row, body: string) {
    if (!row.report) {
      return false;
    }

    const trimmedBody = body.trim();

    if (!trimmedBody) {
      return false;
    }

    if (isPreview) {
      const comment: DashboardComment = {
        id: `preview-comment-${Date.now()}`,
        body: trimmedBody,
        createdAt: new Date().toISOString(),
        author: {
          name: userName ?? "Reviewer",
          email: userEmail ?? null
        }
      };

      setItems((current) =>
        current.map((item) =>
          item.report?.id === row.report!.id
            ? {
                ...item,
                report: {
                  ...item.report,
                  comments: [...item.report.comments, comment]
                }
              }
            : item
        )
      );
      setNotice("Comment added.");
      return true;
    }

    const response = await fetch(`/api/reports/${row.report.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: trimmedBody })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setNotice(result.error ?? "Unable to add comment.");
      return false;
    }

    setItems((current) => current.map((item) => (item.report?.id === result.report.id ? { ...item, report: result.report } : item)));
    setNotice("Comment added.");
    return true;
  }

  return (
    <ReferenceAppShell
      active="review"
      variant="admin"
      userName={userName}
      userEmail={userEmail}
      userRole={userRole ?? "Reviewer"}
      userStatus={userStatus}
      timezone={timezone}
      mustChangePassword={mustChangePassword}
      preview={isPreview}
    >
      {activeRow ? (
        <ReportReviewPage
          row={activeRow}
          date={date}
          reviewerId={reviewerId}
          notice={notice}
          onBack={() => setActiveReportUserId(null)}
          onSetRead={(read) => setReadState(activeRow, read)}
          onAddComment={(body) => addComment(activeRow, body)}
          onPrint={() => {
            window.print();
            setNotice("Use the browser print dialog to save this report as PDF.");
          }}
        />
      ) : (
        <main className="reference-page">
          <div className="mb-5">
            <h1 className="text-[28px] font-semibold leading-tight tracking-normal text-[#101828] dark:text-foreground">Review Dashboard</h1>
            <p className="mt-2 text-sm text-[#667085] dark:text-muted-foreground">Track report coverage, blockers, and submissions across the team.</p>
          </div>

          <section className="mb-4 rounded-[12px] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.07)] ring-1 ring-[#e5eaf2] dark:bg-[#101d2e] dark:ring-[#263a55]">
            <div className="grid gap-4 lg:grid-cols-[minmax(210px,260px)_minmax(190px,230px)_minmax(190px,230px)_minmax(260px,1fr)_auto]">
              <Field label="Report Date">
                <label className="relative flex h-11 items-center rounded-[8px] border border-[#d8dee8] bg-white px-4 text-sm text-[#344054] dark:border-[#263a55] dark:bg-[#0b1523] dark:text-foreground">
                  <CalendarDays className="mr-3 h-4 w-4 text-[#667085]" />
                  <span className="pointer-events-none flex-1">{formatReportDate(date)}</span>
                  <ChevronDown className="ml-3 h-4 w-4 text-[#667085]" />
                  <Input
                    type="date"
                    value={dateInputValue(date)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    onChange={(event) => goToDate(event.target.value)}
                    aria-label="Report date"
                  />
                </label>
              </Field>

              <Field label="Group">
                <Select
                  value={groupFilter}
                  className="h-11 rounded-[8px] bg-white dark:bg-[#0b1523]"
                  onChange={(event) => {
                    setGroupFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="EMPLOYEES">Employees</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="MISSING">Missing</option>
                  <option value="BLOCKERS">With blockers</option>
                </Select>
              </Field>

              <Field label="Work Location">
                <Select
                  value={locationFilter}
                  className="h-11 rounded-[8px] bg-white dark:bg-[#0b1523]"
                  onChange={(event) => {
                    setLocationFilter(event.target.value);
                    setPage(1);
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
              </Field>

              <Field label="Search employees">
                <label className="relative block">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667085]" />
                  <Input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    className="h-11 rounded-[8px] bg-white pl-11 dark:bg-[#0b1523]"
                    placeholder="Search by name or email..."
                  />
                </label>
              </Field>

              <div className="flex items-end justify-end gap-3">
                <Button variant="outline" className="h-11 rounded-[8px] bg-white px-5 dark:bg-[#0b1523]" onClick={sendEmailDigest} disabled={isSendingDigest}>
                  <Mail className="mr-2 h-4 w-4" />
                  {isSendingDigest ? "Sending..." : "Email digest"}
                </Button>
                <Button className="h-11 rounded-[8px] bg-[#2563eb] px-5 text-white hover:bg-[#1d4ed8]" onClick={downloadCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
            </div>
          </section>

          {notice ? (
            <div className="mb-4 rounded-[10px] bg-[#eef5ff] px-4 py-3 text-sm text-[#1d4ed8] ring-1 ring-[#bfdbfe] dark:bg-blue-400/10 dark:text-blue-100 dark:ring-blue-300/20">
              {notice}
            </div>
          ) : null}

          <section className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardStat icon={<CheckCircle2 />} label="Submitted" value={submitted} tone="green" />
            <DashboardStat icon={<CircleHelp />} label="Missing" value={missing} tone="orange" />
            <DashboardStat icon={<TriangleAlert />} label="With blockers" value={blockers} tone="red" />
            <DashboardStat icon={<Edit3 />} label="Late edits" value={lateEdits} tone="purple" />
          </section>

          <section className="mb-4 rounded-[12px] bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.07)] ring-1 ring-[#e5eaf2] dark:bg-[#101d2e] dark:ring-[#263a55]">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <h2 className="text-base font-semibold text-[#101828] dark:text-foreground">Submission Coverage</h2>
                <div className="mt-2 flex items-end gap-3">
                  <span className="text-[32px] font-semibold leading-none text-[#2563eb]">{coverage}%</span>
                  <span className="pb-1 text-sm font-medium text-[#475467] dark:text-muted-foreground">
                    {submitted} of {total} expected reports submitted
                  </span>
                </div>
                <div className="mt-4 h-2 rounded-full bg-[#e9edf5] dark:bg-[#263a55]">
                  <div className="h-2 rounded-full bg-[#2563eb]" style={{ width: `${coverage}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-[#e2e8f0] dark:divide-[#263a55]">
                <CoverageMetric label="Expected" value={total} />
                <CoverageMetric label="Submitted" value={submitted} />
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[12px] bg-white shadow-[0_8px_28px_rgba(15,23,42,0.07)] ring-1 ring-[#e5eaf2] dark:bg-[#101d2e] dark:ring-[#263a55]">
            <div className="p-5">
              <h2 className="text-lg font-semibold text-[#101828] dark:text-foreground">Employee Reports</h2>
            </div>
            <div className="overflow-x-auto px-4">
              <table className="w-full min-w-[940px] text-sm">
                <thead>
                  <tr className="border-b border-[#e5eaf2] text-left text-xs font-semibold text-[#64748b] dark:border-[#263a55] dark:text-muted-foreground">
                    <th className="w-[24%] px-4 py-3">Employee</th>
                    <th className="w-[14%] px-4 py-3">Status</th>
                    <th className="w-[16%] px-4 py-3">Flags</th>
                    <th className="w-[17%] px-4 py-3">Location</th>
                    <th className="w-[20%] px-4 py-3">Submitted</th>
                    <th className="w-[9%] px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8">
                        <EmptyReferenceState>No employee reports match these filters.</EmptyReferenceState>
                      </td>
                    </tr>
                  ) : (
                    pageItems.map((row, index) => {
                      const status = reportStatus(row, date);
                      const flags = dashboardFlags(row, date);
                      const unread = isUnreadForReviewer(row.report, reviewerId);

                      return (
                        <tr
                          key={row.user.id}
                          className={cn(
                            "border-b border-[#e5eaf2] text-[#344054] transition-colors last:border-b-0 hover:bg-[#f8fbff] dark:border-[#263a55] dark:text-muted-foreground dark:hover:bg-white/[0.04]",
                            unread && "bg-[#f4f8ff] dark:bg-blue-400/10"
                          )}
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <span className={cn("h-2 w-2 rounded-full", unread ? "bg-[#2563eb]" : "bg-transparent")} />
                              <Avatar name={row.user.name ?? row.user.email} />
                              <span className="font-semibold text-[#101828] dark:text-foreground">{row.user.name ?? row.user.email ?? "Employee"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={cn("inline-flex rounded-full px-4 py-1.5 text-xs font-semibold", statusClass(status))}>{status}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              {flags.length === 0 ? (
                                <span className="text-[#98a2b3]">-</span>
                              ) : (
                                flags.map((flag) => (
                                  <span
                                    key={flag.key}
                                    title={flag.label}
                                    className={cn(
                                      "inline-flex h-8 w-8 items-center justify-center rounded-full border bg-white dark:bg-[#0b1523]",
                                      flag.key === "blockers" && "border-red-200 text-[#ef4444] dark:border-red-300/25",
                                      flag.key === "activities" && "border-blue-200 text-[#2563eb] dark:border-blue-300/25",
                                      flag.key === "edited" && "border-purple-200 text-[#8b5cf6] dark:border-purple-300/25",
                                      flag.key === "late" && "border-red-200 text-[#ef4444] dark:border-red-300/25"
                                    )}
                                  >
                                    {flag.icon}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">{row.report ? titleCase(row.report.workLocation) : "-"}</td>
                          <td className="px-4 py-3.5">{formatTimestamp(row.report?.submittedAt)}</td>
                          <td className="px-4 py-3.5 text-center">
                            {row.report ? (
                              <Button variant="outline" className="h-9 rounded-[7px] px-5 text-[#2563eb]" onClick={() => setActiveReportUserId(row.user.id)}>
                                Review
                              </Button>
                            ) : (
                              <Button variant="outline" className="h-9 rounded-[7px] px-5 text-[#64748b]" disabled title="Reminder emails are coming soon">
                                Remind (coming soon)
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm text-[#475467] dark:text-muted-foreground">
              <div className="flex items-center gap-3">
                <span>Rows per page</span>
                <Select
                  value={String(pageSize)}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="h-10 w-20 rounded-[7px] bg-white dark:bg-[#0b1523]"
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                </Select>
              </div>
              <div className="flex items-center gap-8">
                <span>
                  {filteredItems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredItems.length)} of {filteredItems.length}
                </span>
                <div className="flex items-center gap-4">
                  <button aria-label="First page" onClick={() => setPage(1)} disabled={currentPage === 1}>
                    <ChevronsLeft className="h-4 w-4" />
                  </button>
                  <button aria-label="Previous page" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="flex h-9 w-9 items-center justify-center rounded-[7px] border border-[#93c5fd] text-[#2563eb]">{currentPage}</span>
                  <button aria-label="Next page" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount}>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button aria-label="Last page" onClick={() => setPage(pageCount)} disabled={currentPage === pageCount}>
                    <ChevronsRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}
    </ReferenceAppShell>
  );
}

function setLocalReadReceipt(rows: Row[], reportId: string, reviewerId: string, read: boolean) {
  return rows.map((row) => {
    if (!row.report || row.report.id !== reportId) {
      return row;
    }

    const existingReceipts = row.report.readReceipts ?? [];

    return {
      ...row,
      report: {
        ...row.report,
        readReceipts: read
          ? [
              ...existingReceipts.filter((receipt) => receipt.reviewerId !== reviewerId),
              {
                reviewerId,
                readAt: new Date().toISOString()
              }
            ]
          : existingReceipts.filter((receipt) => receipt.reviewerId !== reviewerId)
      }
    };
  });
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-[#64748b] dark:text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function DashboardStat({
  icon,
  label,
  value,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: "green" | "orange" | "red" | "purple";
}) {
  const toneClass = {
    green: "bg-[#e8f9ef] text-[#16a34a] dark:bg-emerald-400/15 dark:text-emerald-200",
    orange: "bg-[#fff4df] text-[#f59e0b] dark:bg-amber-400/15 dark:text-amber-200",
    red: "bg-[#fdecee] text-[#ef4444] dark:bg-red-400/15 dark:text-red-200",
    purple: "bg-[#f2eafe] text-[#9b5de5] dark:bg-purple-400/15 dark:text-purple-200"
  }[tone];

  return (
    <div className="flex min-h-[104px] items-center gap-5 rounded-[12px] bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.07)] ring-1 ring-[#e5eaf2] dark:bg-[#101d2e] dark:ring-[#263a55]">
      <div className={cn("flex h-14 w-14 items-center justify-center rounded-full", toneClass)}>
        <span className="[&>svg]:h-8 [&>svg]:w-8">{icon}</span>
      </div>
      <div>
        <div className="text-sm font-semibold text-[#475467] dark:text-muted-foreground">{label}</div>
        <div className="mt-2 text-[30px] font-semibold leading-none text-[#101828] dark:text-foreground">{value}</div>
      </div>
    </div>
  );
}

function CoverageMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-8">
      <div className="text-sm font-semibold text-[#667085] dark:text-muted-foreground">{label}</div>
      <div className="mt-2 text-[30px] font-medium leading-none text-[#344054] dark:text-foreground">{value}</div>
    </div>
  );
}

function Avatar({ name }: { name?: string | null }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#9bb8f5] to-[#6d83d9] text-xs font-semibold text-white">
      {initials(name)}
    </div>
  );
}

function ReportReviewPage({
  row,
  date,
  reviewerId,
  notice,
  onBack,
  onSetRead,
  onAddComment,
  onPrint
}: {
  row: Row;
  date: string;
  reviewerId?: string | null;
  notice: string | null;
  onBack: () => void;
  onSetRead: (read: boolean) => void;
  onAddComment: (body: string) => Promise<boolean>;
  onPrint: () => void;
}) {
  const report = row.report;
  const activities = includedActivities(report);
  const blockers = blockerItems(report);
  const unread = isUnreadForReviewer(report, reviewerId);
  const [commentBody, setCommentBody] = useState("");
  const [isAddingComment, setIsAddingComment] = useState(false);

  async function handleCommentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!report || !commentBody.trim()) {
      return;
    }

    setIsAddingComment(true);
    const added = await onAddComment(commentBody);
    setIsAddingComment(false);

    if (added) {
      setCommentBody("");
    }
  }

  return (
    <main className="reference-page">
      <button className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
        Back to review dashboard
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold leading-tight tracking-normal text-[#101828] dark:text-foreground">
            {row.user.name ?? row.user.email ?? "Employee"} - {formatShortDate(report?.reportDate ?? date)} Report
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-5 text-sm text-[#101828] dark:text-foreground">
          <span className="inline-flex items-center gap-3">
              <span className={cn("h-3.5 w-3.5 rounded-full", unread ? "bg-[#2563eb]" : "bg-[#cbd5e1] dark:bg-[#475569]")} />
              {reportSubtitle(row, reviewerId)}
            </span>
            <span className={cn("inline-flex rounded-full px-4 py-1.5 text-sm font-semibold", statusClass(report ? reportStatus(row, date) : "Missing"))}>
              {report ? reportStatus(row, date) : "Missing"}
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="h-12 rounded-[8px] bg-white px-6 dark:bg-[#0b1523]" onClick={() => onSetRead(unread)} disabled={!report}>
            {unread ? "Mark as read" : "Mark unread"}
          </Button>
          <Button className="h-12 rounded-[8px] bg-[#2563eb] px-6 text-white hover:bg-[#1d4ed8]" onClick={onPrint} disabled={!report}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </div>

      {notice ? (
        <div className="mb-4 rounded-[10px] bg-[#eef5ff] px-4 py-3 text-sm text-[#1d4ed8] ring-1 ring-[#bfdbfe] dark:bg-blue-400/10 dark:text-blue-100 dark:ring-blue-300/20">
          {notice}
        </div>
      ) : null}

      <section className="mb-4 grid gap-0 rounded-[12px] bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.07)] ring-1 ring-[#e5eaf2] dark:bg-[#101d2e] dark:ring-[#263a55] md:grid-cols-4 md:divide-x md:divide-[#d8dee8] md:dark:divide-[#263a55]">
        <ReportMetric label="Submitted" value={formatTimestamp(report?.submittedAt)} />
        <ReportMetric label="Last edited" value={formatTimestamp(report?.updatedAt)} />
        <ReportMetric label="Location" value={report ? titleCase(report.workLocation) : "-"} />
        <ReportMetric label="Read status" value={unread ? "Unread" : report ? "Read" : "-"} />
      </section>

      <section className="mb-4 rounded-[12px] bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.07)] ring-1 ring-[#e5eaf2] dark:bg-[#101d2e] dark:ring-[#263a55]">
        <h2 className="mb-3 text-xl font-semibold text-[#101828] dark:text-foreground">Summary</h2>
        <div className="max-h-[190px] overflow-y-auto rounded-[8px] border border-[#d8dee8] bg-white px-4 py-4 text-sm leading-6 text-[#101828] dark:border-[#263a55] dark:bg-[#0b1523] dark:text-foreground">
          {report?.summary ? <p className="whitespace-pre-wrap">{report.summary}</p> : <p className="text-[#667085] dark:text-muted-foreground">No summary recorded.</p>}
        </div>
      </section>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <section className="rounded-[12px] bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.07)] ring-1 ring-[#e5eaf2] dark:bg-[#101d2e] dark:ring-[#263a55]">
          <h2 className="text-xl font-semibold text-[#101828] dark:text-foreground">Included activities ({activities.length})</h2>
          <div className="mt-2 max-h-[250px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e5eaf2] text-left text-xs font-semibold text-[#64748b] dark:border-[#263a55] dark:text-muted-foreground">
                  <th className="py-2 pr-4">Activity</th>
                  <th className="w-36 py-2 pr-4">Source</th>
                  <th className="w-28 py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {activities.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6">
                      <EmptyReferenceState>No activities included.</EmptyReferenceState>
                    </td>
                  </tr>
                ) : (
                  activities.map((activity) => (
                    <tr key={activity.id} className="border-b border-[#e5eaf2] last:border-b-0 dark:border-[#263a55]">
                      <td className="py-2 pr-4">
                        <div className="flex min-w-0 items-center gap-3">
                          {sourceIcon(activity.source)}
                          <span className="truncate font-medium text-[#101828] dark:text-foreground">{activity.title || "Untitled activity"}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-[#344054] dark:text-muted-foreground">{sourceLabel(activity.source)}</td>
                      <td className="py-2 text-[#101828] dark:text-foreground">{formatDuration(activity.durationMinutes)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[12px] bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.07)] ring-1 ring-[#e5eaf2] dark:bg-[#101d2e] dark:ring-[#263a55]">
          <h2 className="text-xl font-semibold text-[#101828] dark:text-foreground">Blockers ({blockers.length})</h2>
          <div className="mt-4 max-h-[250px] overflow-y-auto">
            {blockers.length === 0 ? (
              <EmptyReferenceState>No blockers recorded.</EmptyReferenceState>
            ) : (
              <div className="divide-y divide-[#e5eaf2] dark:divide-[#263a55]">
                {blockers.map((blocker, index) => (
                  <div key={`${blocker}-${index}`} className="flex gap-4 py-4 first:pt-0">
                    <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#ef4444]" />
                    <div>
                      <div className="font-medium text-[#101828] dark:text-foreground">{blocker}</div>
                      <div className="mt-1 text-sm text-[#667085] dark:text-muted-foreground">Reported by the employee in their daily summary.</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="mb-4 rounded-[12px] bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.07)] ring-1 ring-[#e5eaf2] dark:bg-[#101d2e] dark:ring-[#263a55]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-[#101828] dark:text-foreground">Reviewer comments</h2>
          <span className="text-sm font-medium text-[#667085] dark:text-muted-foreground">{report?.comments.length ?? 0} comment{report?.comments.length === 1 ? "" : "s"}</span>
        </div>

        <div className="mt-4 space-y-3">
          {report?.comments.length ? (
            report.comments.map((comment) => (
              <div key={comment.id} className="rounded-[10px] bg-[#f6f9fd] px-4 py-3 ring-1 ring-[#e5eaf2] dark:bg-[#0b1523] dark:ring-[#263a55]">
                <p className="whitespace-pre-wrap text-sm leading-6 text-[#101828] dark:text-foreground">{comment.body}</p>
                <p className="mt-2 text-xs font-medium text-[#667085] dark:text-muted-foreground">
                  {formatTimestamp(comment.createdAt)} by {comment.author.name ?? comment.author.email ?? "Reviewer"}
                </p>
              </div>
            ))
          ) : (
            <EmptyReferenceState>No reviewer comments yet.</EmptyReferenceState>
          )}
        </div>

        <form className="mt-4" onSubmit={handleCommentSubmit}>
          <Textarea
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
            placeholder="Add a note for the employee..."
            disabled={!report || isAddingComment}
            className="min-h-24"
          />
          <div className="mt-3 flex justify-end">
            <Button type="submit" disabled={!report || !commentBody.trim() || isAddingComment}>
              {isAddingComment ? "Adding..." : "Add comment"}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-[12px] bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.07)] ring-1 ring-[#e5eaf2] dark:bg-[#101d2e] dark:ring-[#263a55]">
        <h2 className="text-xl font-semibold text-[#101828] dark:text-foreground">Revision history</h2>
        {report?.revisions.length ? (
          <div className="mt-3 divide-y divide-[#e5eaf2] dark:divide-[#263a55]">
            {report.revisions.map((revision) => (
              <div key={revision.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <Edit3 className="h-4 w-4 text-[#8b5cf6]" />
                  <span className="font-medium text-[#101828] dark:text-foreground">Edited after report date</span>
                </div>
                <span className="text-[#667085] dark:text-muted-foreground">
                  {formatTimestamp(revision.createdAt)} by {revision.editedBy.name ?? revision.editedBy.email ?? "User"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#475467] dark:text-muted-foreground">No revisions recorded yet.</p>
        )}
      </section>
    </main>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-3 md:px-6 md:first:pl-0">
      <div className="text-sm font-semibold text-[#475467] dark:text-muted-foreground">{label}</div>
      <div className="mt-3 text-base font-medium text-[#101828] dark:text-foreground">{value}</div>
    </div>
  );
}
