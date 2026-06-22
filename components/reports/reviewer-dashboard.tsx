"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  ChevronDown,
  Clock3,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  History,
  ListChecks,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MoreHorizontal,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { FormEvent, MouseEvent, ReactNode } from "react";

import { EmptyReferenceState } from "@/components/reports/reference-shell";
import {
  ReportDateSwitcher,
  type ReportDateControl,
} from "@/components/reports/report-date-switcher";
import {
  ReportPdfDocument,
  type ReportPdfActivity,
  type ReportPdfComment,
  type ReportPdfStatusTone,
} from "@/components/reports/report-pdf";
import {
  formatReportDuration,
  reportActivitySourceLabel,
  ReportActivitySourceIcon,
  ReportPageHeader,
  ReportSearchField,
  ReportStatusBadge,
  ReportSurface,
} from "@/components/reports/report-ui";
import { SummaryRenderer } from "@/components/reports/summary-renderer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FixedToast } from "@/components/ui/fixed-toast";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { markServerDataStale } from "@/lib/client-cache-invalidation";
import { dateOnlyDisplayDate, dateOnlyString } from "@/lib/date-only";
import {
  addReportDateDays,
  clampReportDateToToday,
  reportDayEnd,
  todayDateString,
} from "@/lib/dates";
import { defaultPaginationPageSize } from "@/lib/pagination";
import type { SummaryActivityReferenceMap } from "@/lib/summary-format";
import {
  wfhDayFraction,
  workLocationLabel as sharedWorkLocationLabel,
  workLocationValues,
  type WorkLocationValue,
} from "@/lib/work-locations";
import { cn, initials, titleCase } from "@/lib/utils";

type DashboardUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
  roles?: string[] | null;
  status?: string | null;
  departments?: Array<{
    role?: string | null;
    department?: { name?: string | null } | null;
  }>;
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
  submittedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  activities: DashboardActivity[];
  comments: DashboardComment[];
  readReceipts?: Array<{ reviewerId: string; readAt: string | Date }>;
  revisions: Array<{
    id: string;
    createdAt: string | Date;
    editedBy: { name?: string | null; email?: string | null };
  }>;
};

type Row = {
  user: DashboardUser;
  report: DashboardReport | null;
};

type WeeklyReportData = {
  id?: string;
  savedReportId?: string;
  employee: DashboardUser;
  weekStart: string | Date;
  weekEnd: string | Date;
  generatedAt?: string | Date;
  submittedCount?: number;
  expectedDays?: number;
  activityCount?: number;
  reports: DashboardReport[];
};

type WeeklyReportSummary = {
  id: string;
  weekStart: string | Date;
  weekEnd: string | Date;
  generatedAt?: string | Date;
  submittedCount: number;
  expectedDays: number;
  activityCount: number;
};

type WeeklyReportState =
  | {
      status: "loading";
      employee: DashboardUser;
    }
  | {
      status: "ready";
      data: WeeklyReportData;
    }
  | {
      status: "error";
      employee: DashboardUser;
      message: string;
    };

type WeeklyReportArchiveState =
  | {
      status: "loading";
      employee: DashboardUser;
    }
  | {
      status: "ready";
      employee: DashboardUser;
      reports: WeeklyReportSummary[];
    }
  | {
      status: "error";
      employee: DashboardUser;
      message: string;
    };

type EmployeeStatusFilter = "ALL" | "SUBMITTED" | "MISSING";
type EmployeeRowStatus = DashboardReport["status"] | "MISSING";
type EmployeeSortKey =
  | "employee"
  | "department"
  | "status"
  | "flags"
  | "location"
  | "submitted";
type SortDirection = "asc" | "desc";
type EmployeeSortState = {
  key: EmployeeSortKey;
  direction: SortDirection;
};
type EmployeeTableControls = {
  search: string;
  departmentFilter: string;
  statusFilter: EmployeeStatusFilter;
  sortState: EmployeeSortState;
};

type Metrics = {
  users: number;
  submitted: number;
  sourceMix: Array<{ source: string; count: number }>;
};

type WorkLocationKey = WorkLocationValue;

type WorkLocationBreakdownData = {
  totalSubmitted: number;
  wfhDays: number;
  missing: number;
  draft: number;
  counts: Record<WorkLocationKey, number>;
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

function formatShortDate(value?: string | Date) {
  const date = value ? dateOnlyDisplayDate(value) : null;

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatWeekdayShortDate(value?: string | Date) {
  const date = value ? dateOnlyDisplayDate(value) : null;

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatWeekdayOnly(value?: string | Date) {
  const date = value ? dateOnlyDisplayDate(value) : null;

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
  }).format(date);
}

function formatFullWeekdayDate(value?: string | Date) {
  const date = value ? dateOnlyDisplayDate(value) : null;

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatMonthDay(value?: string | Date) {
  const date = value ? dateOnlyDisplayDate(value) : null;

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatWeekRange(start?: string | Date, end?: string | Date) {
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function reportWeekDates(start: string | Date, end: string | Date) {
  const dates: string[] = [];
  let cursor = dateInputValue(start);
  const endDate = dateInputValue(end);

  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addReportDateDays(cursor, 1);
  }

  return dates;
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

function isLate(report: DashboardReport | null, date: string) {
  const submittedAt = toDate(report?.submittedAt);
  return Boolean(
    submittedAt && submittedAt > reportDayEnd(report?.reportDate ?? date),
  );
}

function editedAfterDate(report: DashboardReport | null, date: string) {
  return Boolean(
    report?.revisions.some((revision) => {
      const editedAt = toDate(revision.createdAt);
      return Boolean(
        editedAt && editedAt > reportDayEnd(report.reportDate ?? date),
      );
    }),
  );
}

const workLocationKeys = [...workLocationValues];
const wfhWarningPercent = 50;
const wfhCriticalPercent = 70;

function normalizedWorkLocation(value?: string | null): WorkLocationKey {
  return workLocationKeys.includes(value as WorkLocationKey)
    ? (value as WorkLocationKey)
    : "UNKNOWN";
}

function workLocationLabel(value?: string | null) {
  return sharedWorkLocationLabel(normalizedWorkLocation(value));
}

function percentage(count: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((count / total) * 100);
}

function workLocationBreakdown(rows: Row[]): WorkLocationBreakdownData {
  const counts = Object.fromEntries(
    workLocationKeys.map((location) => [location, 0]),
  ) as Record<WorkLocationKey, number>;
  let totalSubmitted = 0;
  let wfhDays = 0;
  let missing = 0;
  let draft = 0;

  for (const row of rows) {
    if (!row.report) {
      missing += 1;
      continue;
    }

    if (row.report.status !== "SUBMITTED") {
      draft += 1;
      continue;
    }

    totalSubmitted += 1;
    const location = normalizedWorkLocation(row.report.workLocation);
    counts[location] += 1;
    wfhDays += wfhDayFraction(location);
  }

  return {
    totalSubmitted,
    wfhDays,
    missing,
    draft,
    counts,
  };
}

function weeklyWorkLocationBreakdown(
  reports: DashboardReport[],
  expectedDays: number,
): WorkLocationBreakdownData {
  const counts = Object.fromEntries(
    workLocationKeys.map((location) => [location, 0]),
  ) as Record<WorkLocationKey, number>;
  let totalSubmitted = 0;
  let wfhDays = 0;
  let draft = 0;

  for (const report of reports) {
    if (report.status !== "SUBMITTED") {
      draft += 1;
      continue;
    }

    totalSubmitted += 1;
    const location = normalizedWorkLocation(report.workLocation);
    counts[location] += 1;
    wfhDays += wfhDayFraction(location);
  }

  return {
    totalSubmitted,
    wfhDays,
    draft,
    missing: Math.max(0, expectedDays - totalSubmitted - draft),
    counts,
  };
}

function wfhWarning(breakdown: WorkLocationBreakdownData) {
  const percent = percentage(breakdown.wfhDays, breakdown.totalSubmitted);

  if (breakdown.totalSubmitted === 0 || percent < wfhWarningPercent) {
    return null;
  }

  return {
    percent,
    label: percent >= wfhCriticalPercent ? "High WFH" : "WFH watch",
    tone: percent >= wfhCriticalPercent ? "red" : "yellow",
  } as const;
}

function includedActivities(report: DashboardReport | null) {
  return report?.activities.filter((activity) => activity.selected) ?? [];
}

function visibleReviewComments(report: DashboardReport | null) {
  return (
    report?.comments.filter(
      (comment) => comment.body.trim().toLowerCase() !== "reviewed",
    ) ?? []
  );
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

function reportPdfStatusTone(status: string): ReportPdfStatusTone {
  if (status === "Missing") {
    return "red";
  }

  if (status === "Draft") {
    return "orange";
  }

  if (status === "Submitted") {
    return "green";
  }

  return "neutral";
}

function userDepartmentLabel(user: DashboardUser) {
  const departments =
    user.departments
      ?.filter((membership) => (membership.role ?? "EMPLOYEE") === "EMPLOYEE")
      ?.map((membership) => membership.department?.name)
      .filter(Boolean) ?? [];
  return departments.length ? departments.join(", ") : "No department";
}

function hasDashboardRole(user: DashboardUser, role: string) {
  return (user.roles?.length ? user.roles : [user.role]).includes(role);
}

function reportReadReceipt(
  report: DashboardReport | null,
  reviewerId?: string | null,
) {
  if (!report || !reviewerId) {
    return null;
  }

  return (
    report.readReceipts?.find((receipt) => receipt.reviewerId === reviewerId) ??
    null
  );
}

function reportChangedAt(report: DashboardReport | null) {
  return toDate(report?.updatedAt) ?? toDate(report?.submittedAt);
}

function isUnreadForReviewer(
  report: DashboardReport | null,
  reviewerId?: string | null,
) {
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

function dashboardFlags(row: Row, date: string) {
  if (!row.report) {
    return [];
  }

  const flags: Array<{ key: string; icon: ReactNode; label: string }> = [];

  if (row.report.activities.length > 0) {
    flags.push({
      key: "activities",
      icon: <FileText className="h-4 w-4" />,
      label: "Activity",
    });
  }

  if (editedAfterDate(row.report, date)) {
    flags.push({
      key: "edited",
      icon: <Edit3 className="h-4 w-4" />,
      label: "Late edit",
    });
  }

  if (isLate(row.report, date)) {
    flags.push({
      key: "late",
      icon: <Clock3 className="h-4 w-4" />,
      label: "Late",
    });
  }

  return flags;
}

function userLabel(user: DashboardUser) {
  return user.name ?? user.email ?? "Employee";
}

function employeeLabel(row: Row) {
  return userLabel(row.user);
}

function employeeStatusFilterValue(row: Row): EmployeeRowStatus {
  if (!row.report) {
    return "MISSING";
  }

  return row.report.status;
}

function canReviewReport(row: Row) {
  return row.report?.status === "SUBMITTED";
}

function reportUserIdForReportId(rows: Row[], reportId?: string | null) {
  if (!reportId) {
    return null;
  }

  return rows.find((row) => row.report?.id === reportId)?.user.id ?? null;
}

function submittedSortValue(row: Row) {
  return toDate(row.report?.submittedAt)?.getTime() ?? null;
}

function attentionSortRank(row: Row) {
  if (!row.report) {
    return 0;
  }

  if (row.report.status === "DRAFT") {
    return 1;
  }

  return 2;
}

function compareText(first: string, second: string, direction: SortDirection) {
  const delta = first.localeCompare(second, undefined, {
    sensitivity: "base",
  });
  return direction === "asc" ? delta : -delta;
}

function compareSubmittedRows(
  first: Row,
  second: Row,
  direction: SortDirection,
) {
  const firstSubmitted = submittedSortValue(first);
  const secondSubmitted = submittedSortValue(second);

  if (firstSubmitted === null && secondSubmitted !== null) {
    return 1;
  }

  if (firstSubmitted !== null && secondSubmitted === null) {
    return -1;
  }

  if (firstSubmitted === null || secondSubmitted === null) {
    return 0;
  }

  return direction === "asc"
    ? firstSubmitted - secondSubmitted
    : secondSubmitted - firstSubmitted;
}

function flagSortLabel(row: Row, date: string) {
  return dashboardFlags(row, date)
    .map((flag) => flag.label)
    .join(", ");
}

function locationSortLabel(row: Row) {
  return row.report ? workLocationLabel(row.report.workLocation) : "";
}

function compareEmployeeRows(
  first: Row,
  second: Row,
  date: string,
  sortState: EmployeeSortState,
) {
  let delta = 0;

  if (sortState.key === "employee") {
    delta = compareText(
      employeeLabel(first),
      employeeLabel(second),
      sortState.direction,
    );
  } else if (sortState.key === "department") {
    delta = compareText(
      userDepartmentLabel(first.user),
      userDepartmentLabel(second.user),
      sortState.direction,
    );
  } else if (sortState.key === "status") {
    delta =
      (attentionSortRank(first) - attentionSortRank(second)) *
      (sortState.direction === "asc" ? 1 : -1);
  } else if (sortState.key === "flags") {
    delta = compareText(
      flagSortLabel(first, date),
      flagSortLabel(second, date),
      sortState.direction,
    );
  } else if (sortState.key === "location") {
    delta = compareText(
      locationSortLabel(first),
      locationSortLabel(second),
      sortState.direction,
    );
  } else {
    delta = compareSubmittedRows(first, second, sortState.direction);
  }

  return (
    delta ||
    employeeLabel(first).localeCompare(employeeLabel(second), undefined, {
      sensitivity: "base",
    }) ||
    first.user.id.localeCompare(second.user.id)
  );
}

const statusFilterOptions: Array<{
  value: EmployeeStatusFilter;
  label: string;
}> = [
  { value: "ALL", label: "All" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "MISSING", label: "Missing" },
];

const employeeSortKeys: EmployeeSortKey[] = [
  "employee",
  "department",
  "status",
  "flags",
  "location",
  "submitted",
];
const sortDirections: SortDirection[] = ["asc", "desc"];
const employeeTableControlsStorageKey = "generis.reviewer.employeeReports";
const defaultEmployeeTablePageSize = defaultPaginationPageSize;

const defaultEmployeeSortState: EmployeeSortState = {
  key: "employee",
  direction: "asc",
};

function isEmployeeStatusFilter(value: unknown): value is EmployeeStatusFilter {
  return (
    typeof value === "string" &&
    statusFilterOptions.some((option) => option.value === value)
  );
}

function isEmployeeSortState(value: unknown): value is EmployeeSortState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const sortState = value as Record<string, unknown>;
  return (
    typeof sortState.key === "string" &&
    employeeSortKeys.includes(sortState.key as EmployeeSortKey) &&
    typeof sortState.direction === "string" &&
    sortDirections.includes(sortState.direction as SortDirection)
  );
}

function isDefaultEmployeeTableControls(controls: EmployeeTableControls) {
  return (
    controls.search.trim().length === 0 &&
    controls.departmentFilter === "ALL" &&
    controls.statusFilter === "ALL" &&
    controls.sortState.key === defaultEmployeeSortState.key &&
    controls.sortState.direction === defaultEmployeeSortState.direction
  );
}

function readEmployeeTableControls() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(
      employeeTableControlsStorageKey,
    );

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as Record<string, unknown>;

    if (!parsedValue || typeof parsedValue !== "object") {
      return null;
    }

    return {
      search: typeof parsedValue.search === "string" ? parsedValue.search : "",
      departmentFilter:
        typeof parsedValue.departmentFilter === "string"
          ? parsedValue.departmentFilter
          : "ALL",
      statusFilter: isEmployeeStatusFilter(parsedValue.statusFilter)
        ? parsedValue.statusFilter
        : "ALL",
      sortState: isEmployeeSortState(parsedValue.sortState)
        ? parsedValue.sortState
        : defaultEmployeeSortState,
    };
  } catch {
    return null;
  }
}

function writeEmployeeTableControls(controls: EmployeeTableControls) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (isDefaultEmployeeTableControls(controls)) {
      window.localStorage.removeItem(employeeTableControlsStorageKey);
      return;
    }

    window.localStorage.setItem(
      employeeTableControlsStorageKey,
      JSON.stringify(controls),
    );
  } catch {
    // Persistence should never block the dashboard controls.
  }
}

function sortAriaValue(
  sortState: EmployeeSortState,
  sortKey: EmployeeSortKey,
): "ascending" | "descending" | "none" {
  if (sortState.key !== sortKey) {
    return "none";
  }

  return sortState.direction === "asc" ? "ascending" : "descending";
}

function SortableHeader({
  label,
  sortKey,
  sortState,
  onSort,
}: {
  label: string;
  sortKey: EmployeeSortKey;
  sortState: EmployeeSortState;
  onSort: (sortKey: EmployeeSortKey) => void;
}) {
  const active = sortState.key === sortKey;
  const nextDirection = active
    ? sortState.direction === "asc"
      ? "descending"
      : "ascending"
    : sortKey === "submitted"
      ? "descending"
      : "ascending";

  return (
    <button
      type="button"
      className={cn(
        "-ml-1 inline-flex max-w-full items-center gap-1 rounded-[6px] px-1 py-0.5 text-left font-semibold uppercase tracking-[0.02em] text-inherit transition-colors hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:hover:text-foreground",
        active && "text-[#1d4ed8] dark:text-[#93c5fd]",
      )}
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label} ${nextDirection}`}
    >
      <span className="truncate">{label}</span>
      <ChevronDown
        className={cn(
          "h-3 w-3 shrink-0 transition-[opacity,transform]",
          active ? "opacity-100" : "opacity-0",
          sortState.direction === "asc" && "rotate-180",
        )}
        aria-hidden="true"
      />
    </button>
  );
}

function ReviewerRowMenuButton({
  icon,
  children,
  onClick,
  disabled = false,
  tone = "default",
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:cursor-not-allowed disabled:opacity-60",
        tone === "danger"
          ? "text-[#dc2626] hover:bg-[#fef2f2] dark:text-red-300 dark:hover:bg-red-400/10"
          : "text-[#334155] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5",
      )}
      onClick={onClick}
    >
      <span
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:h-4 [&_svg]:w-4"
        aria-hidden="true"
      >
        {icon}
      </span>
      {children}
    </button>
  );
}

export function ReviewerDashboard({
  rows,
  metrics: _metrics,
  date,
  reviewerId,
  viewerRoles,
  initialOpenedReportId,
  basePath = "/review",
  title = "Track report submissions across the team",
  description,
  embedded = false,
}: {
  rows: Row[];
  metrics: Metrics;
  date: string;
  reviewerId?: string | null;
  viewerRoles?: string[] | null;
  initialOpenedReportId?: string | null;
  basePath?: string;
  title?: string;
  description?: string;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(rows);
  const [activeReportUserId, setActiveReportUserId] = useState<string | null>(
    () => reportUserIdForReportId(rows, initialOpenedReportId),
  );
  const [weeklyReportState, setWeeklyReportState] =
    useState<WeeklyReportState | null>(null);
  const [weeklyReportArchiveState, setWeeklyReportArchiveState] =
    useState<WeeklyReportArchiveState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [remindingUserId, setRemindingUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<EmployeeStatusFilter>("ALL");
  const [employeePage, setEmployeePage] = useState(1);
  const [employeePageSize, setEmployeePageSize] = useState(
    defaultEmployeeTablePageSize,
  );
  const [sortState, setSortState] = useState<EmployeeSortState>(
    defaultEmployeeSortState,
  );
  const [hasLoadedTableControls, setHasLoadedTableControls] = useState(false);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [adminReportAction, setAdminReportAction] = useState<{
    reportId: string;
    action: "reopen" | "delete";
  } | null>(null);
  const [rowActionMenu, setRowActionMenu] = useState<{
    userId: string;
    top: number;
    left: number;
  } | null>(null);
  const [blockedOpenUserId, setBlockedOpenUserId] = useState<string | null>(
    null,
  );
  const [pendingDateControl, setPendingDateControl] =
    useState<ReportDateControl | null>(null);
  const pendingDateRef = useRef<string | null>(null);
  const blockedOpenTimerRef = useRef<number | null>(null);
  const rowActionMenuRef = useRef<HTMLDivElement | null>(null);
  const unsavedReviewNoteRef = useRef(false);
  const openReportIdRef = useRef<string | null>(null);
  const maxReportDate = todayDateString();
  const currentReviewDate = dateInputValue(date);
  const dateNavigationPending = pendingDateControl !== null;
  const viewerRoleSet = useMemo(
    () => new Set(viewerRoles ?? (reviewerId ? ["REVIEWER"] : [])),
    [reviewerId, viewerRoles],
  );
  const canUseReviewerActions = viewerRoleSet.has("REVIEWER");
  const canAdminManageReports = viewerRoleSet.has("ADMIN");

  const departmentOptions = useMemo(() => {
    return [
      ...new Set(
        items
          .filter((row) => hasDashboardRole(row.user, "EMPLOYEE"))
          .map((row) => userDepartmentLabel(row.user)),
      ),
    ].sort((first, second) => first.localeCompare(second));
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items
      .filter((row) => {
        const employee =
          `${row.user.name ?? ""} ${row.user.email ?? ""}`.toLowerCase();
        const matchesSearch = !query || employee.includes(query);
        const matchesDepartment =
          departmentFilter === "ALL" ||
          userDepartmentLabel(row.user) === departmentFilter;
        const matchesStatus =
          statusFilter === "ALL" ||
          employeeStatusFilterValue(row) === statusFilter;

        return (
          hasDashboardRole(row.user, "EMPLOYEE") &&
          matchesSearch &&
          matchesDepartment &&
          matchesStatus
        );
      })
      .sort((first, second) =>
        compareEmployeeRows(first, second, date, sortState),
      );
  }, [date, departmentFilter, items, search, sortState, statusFilter]);
  const locationBreakdown = useMemo(
    () => workLocationBreakdown(filteredItems),
    [filteredItems],
  );
  const employeePageCount = Math.max(
    1,
    Math.ceil(filteredItems.length / employeePageSize),
  );
  const currentEmployeePage = Math.min(employeePage, employeePageCount);
  const pagedItems = filteredItems.slice(
    (currentEmployeePage - 1) * employeePageSize,
    currentEmployeePage * employeePageSize,
  );

  const visibleReportIds = canUseReviewerActions
    ? pagedItems.flatMap((row) =>
        canReviewReport(row) && row.report ? [row.report.id] : [],
      )
    : [];
  const selectedRows = items.filter(
    (row) =>
      canUseReviewerActions &&
      canReviewReport(row) &&
      row.report &&
      selectedReportIds.includes(row.report.id),
  );
  const selectedReportsHaveUnread = selectedRows.some((row) =>
    isUnreadForReviewer(row.report, reviewerId),
  );
  const selectedReadAction = selectedReportsHaveUnread;
  const allVisibleReportsSelected =
    visibleReportIds.length > 0 &&
    visibleReportIds.every((id) => selectedReportIds.includes(id));
  const activeRow = activeReportUserId
    ? (items.find((row) => row.user.id === activeReportUserId) ?? null)
    : null;
  const menuRow = rowActionMenu
    ? (items.find((row) => row.user.id === rowActionMenu.userId) ?? null)
    : null;
  const hasActiveTableControls =
    search.trim().length > 0 ||
    departmentFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    sortState.key !== defaultEmployeeSortState.key ||
    sortState.direction !== defaultEmployeeSortState.direction;

  useEffect(() => {
    setItems(rows);
    setActiveReportUserId(reportUserIdForReportId(rows, initialOpenedReportId));
    unsavedReviewNoteRef.current = false;
    setWeeklyReportState(null);
    setWeeklyReportArchiveState(null);
    setSelectedReportIds([]);
    setAdminReportAction(null);
    setRowActionMenu(null);
    setBlockedOpenUserId(null);
    setRemindingUserId(null);
    pendingDateRef.current = null;
    setPendingDateControl(null);
    setEmployeePage(1);
  }, [date, initialOpenedReportId, rows]);

  useEffect(() => {
    setEmployeePage(1);
  }, [departmentFilter, search, sortState, statusFilter]);

  useEffect(() => {
    if (employeePage > employeePageCount) {
      setEmployeePage(employeePageCount);
    }
  }, [employeePage, employeePageCount]);

  useEffect(() => {
    return () => {
      if (blockedOpenTimerRef.current) {
        window.clearTimeout(blockedOpenTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!rowActionMenu) {
      return;
    }

    function closeMenu() {
      setRowActionMenu(null);
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
  }, [rowActionMenu]);

  useEffect(() => {
    if (!pendingDateControl) {
      return;
    }

    const fallbackTimer = window.setTimeout(() => {
      pendingDateRef.current = null;
      setPendingDateControl(null);
    }, 15000);

    return () => {
      window.clearTimeout(fallbackTimer);
    };
  }, [pendingDateControl]);

  useEffect(() => {
    openReportIdRef.current = activeRow?.report?.id ?? null;
  }, [activeRow?.report?.id]);

  useEffect(() => {
    function syncOpenedReportFromUrl() {
      const reportId = new URL(window.location.href).searchParams.get(
        "reportId",
      );

      if (unsavedReviewNoteRef.current) {
        const shouldDiscard = window.confirm(
          "Discard this unsaved review note?",
        );

        if (!shouldDiscard) {
          updateOpenedReportParam(openReportIdRef.current, "replace");
          return;
        }

        unsavedReviewNoteRef.current = false;
      }

      setWeeklyReportState(null);
      setWeeklyReportArchiveState(null);
      setActiveReportUserId(reportUserIdForReportId(items, reportId));
    }

    window.addEventListener("popstate", syncOpenedReportFromUrl);

    return () => {
      window.removeEventListener("popstate", syncOpenedReportFromUrl);
    };
  }, [items]);

  useEffect(() => {
    const storedControls = readEmployeeTableControls();

    if (storedControls) {
      setSearch(storedControls.search);
      setDepartmentFilter(storedControls.departmentFilter);
      setStatusFilter(storedControls.statusFilter);
      setSortState(storedControls.sortState);
    }

    setHasLoadedTableControls(true);
  }, []);

  useEffect(() => {
    if (
      departmentFilter !== "ALL" &&
      !departmentOptions.includes(departmentFilter)
    ) {
      setDepartmentFilter("ALL");
    }
  }, [departmentFilter, departmentOptions]);

  useEffect(() => {
    if (!hasLoadedTableControls) {
      return;
    }

    writeEmployeeTableControls({
      search,
      departmentFilter,
      statusFilter,
      sortState,
    });
  }, [
    departmentFilter,
    hasLoadedTableControls,
    search,
    sortState,
    statusFilter,
  ]);

  function goToDate(nextDate: string, control: ReportDateControl = "picker") {
    if (!nextDate) {
      return;
    }

    const targetDate = clampReportDateToToday(nextDate);

    if (targetDate === currentReviewDate) {
      return;
    }

    if (pendingDateRef.current === targetDate) {
      return;
    }

    pendingDateRef.current = targetDate;
    setPendingDateControl(control);
    router.push(`${basePath}?date=${targetDate}`);
  }

  function downloadCsv() {
    const exportRows = filteredItems.map((row) => ({
      employee: row.user.name ?? row.user.email ?? "Unassigned employee",
      email: row.user.email ?? "",
      department: userDepartmentLabel(row.user),
      date: formatShortDate(row.report?.reportDate ?? date),
      status: reportStatus(row, date),
      workLocation:
        canReviewReport(row) && row.report
          ? workLocationLabel(row.report.workLocation)
          : "",
      submittedAt: formatTimestamp(row.report?.submittedAt),
      lastEdited: canReviewReport(row)
        ? formatTimestamp(row.report?.updatedAt)
        : "",
      activities: canReviewReport(row)
        ? includedActivities(row.report).length
        : 0,
    }));
    const headers = [
      "employee",
      "email",
      "department",
      "date",
      "status",
      "workLocation",
      "submittedAt",
      "lastEdited",
      "activities",
    ];
    const csv = [
      headers.join(","),
      ...exportRows.map((row) =>
        headers
          .map(
            (header) =>
              `"${String(row[header as keyof typeof row]).replace(/"/g, '""')}"`,
          )
          .join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `generis-review-${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(
      `Exported ${filteredItems.length} row${filteredItems.length === 1 ? "" : "s"}.`,
    );
  }

  function toggleReportSelection(reportId: string, checked: boolean) {
    setSelectedReportIds((current) => {
      if (checked) {
        return current.includes(reportId) ? current : [...current, reportId];
      }

      return current.filter((id) => id !== reportId);
    });
  }

  function toggleVisibleSelection(checked: boolean) {
    setSelectedReportIds((current) => {
      if (!checked) {
        return current.filter((id) => !visibleReportIds.includes(id));
      }

      return [...new Set([...current, ...visibleReportIds])];
    });
  }

  function clearTableControls() {
    setSearch("");
    setDepartmentFilter("ALL");
    setStatusFilter("ALL");
    setSortState(defaultEmployeeSortState);
  }

  function updateOpenedReportParam(
    reportId: string | null,
    mode: "push" | "replace" = "push",
  ) {
    const url = new URL(window.location.href);

    if (reportId) {
      url.searchParams.set("reportId", reportId);
    } else {
      url.searchParams.delete("reportId");
    }

    if (mode === "replace") {
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
      return;
    }

    window.history.pushState(null, "", `${url.pathname}${url.search}`);
  }

  function toggleEmployeeSort(sortKey: EmployeeSortKey) {
    setSortState((current) => ({
      key: sortKey,
      direction:
        current.key === sortKey
          ? current.direction === "asc"
            ? "desc"
            : "asc"
          : sortKey === "submitted"
            ? "desc"
            : "asc",
    }));
  }

  function openReport(row: Row) {
    if (!canReviewReport(row)) {
      return;
    }

    if (canUseReviewerActions) {
      void setReadState(row, true);
    }

    setWeeklyReportState(null);
    setWeeklyReportArchiveState(null);
    setRowActionMenu(null);
    unsavedReviewNoteRef.current = false;
    openReportIdRef.current = row.report?.id ?? null;
    setActiveReportUserId(row.user.id);
    updateOpenedReportParam(row.report?.id ?? null);
  }

  function closeReport() {
    unsavedReviewNoteRef.current = false;
    openReportIdRef.current = null;
    setActiveReportUserId(null);
    updateOpenedReportParam(null);
  }

  async function openWeeklyReport(row: Row) {
    setNotice(null);
    setActiveReportUserId(null);
    updateOpenedReportParam(null);
    setWeeklyReportArchiveState(null);
    setRowActionMenu(null);
    setWeeklyReportState({ status: "loading", employee: row.user });

    let response: Response;
    let body: { error?: string; weeklyReport?: WeeklyReportData };

    try {
      response = await fetch("/api/review/weekly-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: row.user.id,
          date: currentReviewDate,
        }),
      });
      body = await response.json().catch(() => ({}));
    } catch {
      const message =
        "Unable to generate weekly report. Check your connection and try again.";
      setWeeklyReportState({
        status: "error",
        employee: row.user,
        message,
      });
      setNotice(message);
      return;
    }

    if (!response.ok) {
      const message = body.error ?? "Unable to generate weekly report.";
      setWeeklyReportState({
        status: "error",
        employee: row.user,
        message,
      });
      setNotice(message);
      return;
    }

    setWeeklyReportState({ status: "ready", data: body.weeklyReport! });
  }

  async function openWeeklyReportArchive(row: Row) {
    setNotice(null);
    setActiveReportUserId(null);
    updateOpenedReportParam(null);
    setWeeklyReportState(null);
    setRowActionMenu(null);
    setWeeklyReportArchiveState({ status: "loading", employee: row.user });

    let response: Response;
    let body: {
      error?: string;
      weeklyReports?: {
        employee?: DashboardUser;
        reports?: WeeklyReportSummary[];
      };
    };

    try {
      response = await fetch(
        `/api/review/weekly-reports?userId=${encodeURIComponent(row.user.id)}`,
      );
      body = await response.json().catch(() => ({}));
    } catch {
      const message =
        "Unable to load saved weekly reports. Check your connection and try again.";
      setWeeklyReportArchiveState({
        status: "error",
        employee: row.user,
        message,
      });
      setNotice(message);
      return;
    }

    if (!response.ok) {
      const message = body.error ?? "Unable to load saved weekly reports.";
      setWeeklyReportArchiveState({
        status: "error",
        employee: row.user,
        message,
      });
      setNotice(message);
      return;
    }

    setWeeklyReportArchiveState({
      status: "ready",
      employee: body.weeklyReports?.employee ?? row.user,
      reports: body.weeklyReports?.reports ?? [],
    });
  }

  async function openSavedWeeklyReport(
    report: WeeklyReportSummary,
    employee: DashboardUser,
  ) {
    setNotice(null);
    setWeeklyReportArchiveState(null);
    setWeeklyReportState({ status: "loading", employee });

    let response: Response;
    let body: { error?: string; weeklyReport?: WeeklyReportData };

    try {
      response = await fetch(
        `/api/review/weekly-reports/${encodeURIComponent(report.id)}`,
      );
      body = await response.json().catch(() => ({}));
    } catch {
      const message =
        "Unable to load saved weekly report. Check your connection and try again.";
      setWeeklyReportState({ status: "error", employee, message });
      setNotice(message);
      return;
    }

    if (!response.ok) {
      const message = body.error ?? "Unable to load saved weekly report.";
      setWeeklyReportState({ status: "error", employee, message });
      setNotice(message);
      return;
    }

    setWeeklyReportState({ status: "ready", data: body.weeklyReport! });
  }

  function toggleRowActionMenu(row: Row, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    event.currentTarget.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });

    if (rowActionMenu?.userId === row.user.id) {
      setRowActionMenu(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const hasOpenReportAction = canReviewReport(row);
    const hasReviewerReportAction =
      canUseReviewerActions && row.report && canReviewReport(row);
    const hasReminderAction = canUseReviewerActions && !row.report;
    const hasAdminReportActions =
      canAdminManageReports && row.report?.status === "SUBMITTED";
    const menuHeight =
      108 +
      (hasOpenReportAction ? 44 : 0) +
      (hasReviewerReportAction ? 44 : 0) +
      (hasReminderAction ? 44 : 0) +
      (hasAdminReportActions ? 116 : 0);
    const viewportPadding = 12;
    const left = Math.min(
      Math.max(viewportPadding, rect.right - menuWidth),
      Math.max(
        viewportPadding,
        window.innerWidth - menuWidth - viewportPadding,
      ),
    );
    const openBelow =
      window.innerHeight - rect.bottom - viewportPadding >= menuHeight;

    setRowActionMenu({
      userId: row.user.id,
      left,
      top: openBelow
        ? rect.bottom + 6
        : Math.max(viewportPadding, rect.top - menuHeight - 6),
    });
  }

  function nudgeUnavailableReport(row: Row) {
    setBlockedOpenUserId(row.user.id);

    if (blockedOpenTimerRef.current) {
      window.clearTimeout(blockedOpenTimerRef.current);
    }

    blockedOpenTimerRef.current = window.setTimeout(() => {
      setBlockedOpenUserId(null);
      blockedOpenTimerRef.current = null;
    }, 650);
  }

  async function markSelectedReadState() {
    const rowsToUpdate = selectedRows;
    const read = selectedReadAction;

    setSelectedReportIds([]);
    await Promise.all(rowsToUpdate.map((row) => setReadState(row, read)));
  }

  async function sendEmailDigest() {
    setNotice(null);

    setIsSendingDigest(true);
    const response = await fetch("/api/review/email-digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        filters: {
          search,
        },
      }),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setNotice(body.error ?? "Unable to send email digest.");
      setIsSendingDigest(false);
      return;
    }

    const recipients = body.emailRun?.recipientEmails?.length ?? 0;
    markServerDataStale();
    setNotice(
      body.skipped
        ? "Digest was skipped because it was already sent or had no recipients."
        : `Email digest sent to ${recipients} reviewer recipient${recipients === 1 ? "" : "s"}.`,
    );
    setIsSendingDigest(false);
  }

  async function sendReportReminder(row: Row) {
    if (remindingUserId) {
      return;
    }

    setNotice(null);
    setRemindingUserId(row.user.id);

    try {
      const response = await fetch("/api/review/report-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: row.user.id,
          date: currentReviewDate,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setNotice(body.error ?? "Unable to send report reminder.");
        return;
      }

      const employee =
        body.employee?.name ?? body.employee?.email ?? employeeLabel(row);

      if (body.emailDelivery?.status === "SENT") {
        setNotice(`Reminder emailed to ${employee}.`);
        return;
      }

      if (body.emailDelivery?.status === "SKIPPED") {
        setNotice(body.emailDelivery.reason ?? "Reminder email was skipped.");
        return;
      }

      setNotice(body.emailDelivery?.error ?? "Reminder email failed.");
    } finally {
      setRemindingUserId(null);
    }
  }

  async function setReadState(row: Row, read: boolean) {
    if (!row.report || !canUseReviewerActions) {
      return;
    }

    const reportId = row.report.id;
    const activeReviewerId = reviewerId ?? "current-reviewer";
    setNotice(null);
    setItems((current) =>
      setLocalReadReceipt(current, reportId, activeReviewerId, read),
    );

    const response = await fetch(`/api/reports/${reportId}/read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    });

    if (!response.ok) {
      setItems((current) =>
        setLocalReadReceipt(current, reportId, activeReviewerId, !read),
      );
      setNotice(
        read
          ? "Unable to mark report as read."
          : "Unable to mark report unread.",
      );
      return;
    }

    const { report } = await response.json();
    setItems((current) =>
      current.map((item) =>
        item.report?.id === report.id ? { ...item, report } : item,
      ),
    );
    markServerDataStale();
  }

  async function reopenSubmittedReport(row: Row) {
    if (!row.report || adminReportAction) {
      return;
    }

    const employee = employeeLabel(row);

    if (
      !window.confirm(
        `Reopen ${employee}'s submitted report? It will move back to draft.`,
      )
    ) {
      return;
    }

    const reportId = row.report.id;
    setNotice(null);
    setRowActionMenu(null);
    setAdminReportAction({ reportId, action: "reopen" });

    try {
      const response = await fetch(`/api/reports/${reportId}/reopen`, {
        method: "POST",
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setNotice(result.error ?? "Unable to reopen report.");
        return;
      }

      setItems((current) =>
        current.map((item) =>
          item.report?.id === reportId
            ? { ...item, report: result.report as DashboardReport }
            : item,
        ),
      );
      setSelectedReportIds((current) =>
        current.filter((id) => id !== reportId),
      );
      markServerDataStale();
      setNotice(`${employee}'s report was reopened to draft.`);
    } catch {
      setNotice("Unable to reopen report.");
    } finally {
      setAdminReportAction(null);
    }
  }

  async function deleteSubmittedReport(row: Row) {
    if (!row.report || adminReportAction) {
      return;
    }

    const employee = employeeLabel(row);

    if (
      !window.confirm(
        `Delete ${employee}'s submitted report? This cannot be undone.`,
      )
    ) {
      return;
    }

    const reportId = row.report.id;
    setNotice(null);
    setRowActionMenu(null);
    setAdminReportAction({ reportId, action: "delete" });

    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: "DELETE",
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setNotice(result.error ?? "Unable to delete report.");
        return;
      }

      setItems((current) =>
        current.map((item) =>
          item.report?.id === reportId ? { ...item, report: null } : item,
        ),
      );
      setSelectedReportIds((current) =>
        current.filter((id) => id !== reportId),
      );
      markServerDataStale();
      setNotice(`${employee}'s submitted report was deleted.`);
    } catch {
      setNotice("Unable to delete report.");
    } finally {
      setAdminReportAction(null);
    }
  }

  async function addComment(row: Row, body: string) {
    if (!row.report) {
      return false;
    }

    const trimmedBody = body.trim();

    if (!trimmedBody) {
      return false;
    }

    const response = await fetch(`/api/reports/${row.report.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: trimmedBody }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setNotice(result.error ?? "Unable to add comment.");
      return false;
    }

    setItems((current) =>
      current.map((item) =>
        item.report?.id === result.report.id
          ? { ...item, report: result.report }
          : item,
      ),
    );
    markServerDataStale();
    setNotice(
      result.emailDelivery?.status === "SENT"
        ? "Comment added and emailed to the employee."
        : "Comment added.",
    );
    return true;
  }

  return (
    <>
      {weeklyReportArchiveState ? (
        <WeeklyReportArchivePage
          state={weeklyReportArchiveState}
          onBack={() => setWeeklyReportArchiveState(null)}
          onOpenReport={openSavedWeeklyReport}
        />
      ) : weeklyReportState ? (
        <WeeklyReportReviewPage
          state={weeklyReportState}
          onBack={() => setWeeklyReportState(null)}
          onPrint={() => {
            window.print();
            setNotice(
              "Use the browser print dialog to save this weekly report as PDF.",
            );
          }}
        />
      ) : activeRow ? (
        <ReportReviewPage
          row={activeRow}
          date={date}
          canAddReviewNote={canUseReviewerActions}
          onBack={closeReport}
          onAddComment={(body) => addComment(activeRow, body)}
          onUnsavedCommentChange={(dirty) => {
            unsavedReviewNoteRef.current = dirty;
          }}
          onPrint={() => {
            window.print();
            setNotice(
              "Use the browser print dialog to save this report as PDF.",
            );
          }}
        />
      ) : (
        <main
          className={cn(
            embedded ? "min-w-0" : "reference-page",
            "min-[1024px]:flex min-[1024px]:h-full min-[1024px]:min-h-0 min-[1024px]:flex-col",
          )}
        >
          {embedded ? null : (
            <ReportPageHeader title={title} description={description} />
          )}

          <ReportSurface className="mb-3 shrink-0">
            <div className="grid gap-2 min-[760px]:h-10 min-[760px]:grid-cols-[minmax(240px,300px)_auto] min-[760px]:items-center min-[760px]:justify-between">
              <ReportDateSwitcher
                value={currentReviewDate}
                maxDate={maxReportDate}
                pendingControl={pendingDateControl}
                disabled={dateNavigationPending}
                onChange={goToDate}
              />

              <div className="flex flex-wrap items-center gap-2 min-[760px]:flex-nowrap">
                <Button
                  variant="outline"
                  className="h-10 min-w-[118px] shrink-0 justify-center rounded-[8px] bg-white px-3 text-xs shadow-none ring-1 ring-[#dfe4ee] dark:bg-[#0b1523] dark:ring-[#263a55]"
                  onClick={sendEmailDigest}
                  disabled={isSendingDigest}
                  hidden={!canUseReviewerActions}
                >
                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                  {isSendingDigest ? "Sending..." : "Email digest"}
                </Button>
                <Button
                  className="h-10 min-w-[96px] shrink-0 justify-center rounded-[8px] bg-[#2563eb] px-3 text-xs font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.2)] hover:bg-[#1d4ed8]"
                  onClick={downloadCsv}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Export
                </Button>
              </div>
            </div>
            <WorkLocationBreakdown breakdown={locationBreakdown} />
          </ReportSurface>

          <ReportSurface
            padded={false}
            className="reference-paginated-surface min-[1024px]:flex-1"
          >
            <div className="grid shrink-0 gap-3 p-3 min-[1180px]:grid-cols-[auto_minmax(0,1fr)] min-[1180px]:items-start">
              <div className="flex min-w-0 items-center gap-3 pt-1">
                <h2 className="text-lg font-semibold text-[#101828] dark:text-foreground">
                  Employee Reports
                </h2>
                <div className="min-h-9 min-w-0 flex-1">
                  {selectedRows.length > 0 ? (
                    <div className="inline-flex h-9 max-w-full items-center gap-2 rounded-[9px] bg-[#f4f8ff] px-2 py-1.5 ring-1 ring-[#dbe7f5] dark:bg-blue-400/10 dark:ring-blue-300/15">
                      <span className="shrink-0 px-1 text-xs font-semibold text-[#475467] dark:text-muted-foreground">
                        {selectedRows.length} selected
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 rounded-[7px] bg-white px-3 text-xs dark:bg-[#0b1523]"
                        onClick={markSelectedReadState}
                      >
                        {selectedReadAction ? "Mark as read" : "Mark as unread"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid w-full gap-2 min-[760px]:grid-cols-[minmax(220px,1fr)_minmax(190px,260px)] min-[1040px]:grid-cols-[minmax(220px,1fr)_minmax(190px,260px)_minmax(232px,280px)_auto] min-[1180px]:justify-self-end">
                <ReportSearchField
                  value={search}
                  onValueChange={(value) => {
                    setSearch(value);
                  }}
                  className="w-full"
                  placeholder="Search employees"
                  aria-label="Search employees"
                />

                <Select
                  value={departmentFilter}
                  onChange={(event) => setDepartmentFilter(event.target.value)}
                  className="h-10 w-full"
                  aria-label="Filter by department"
                >
                  <option value="ALL">All departments</option>
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </Select>

                <div
                  className="grid h-10 w-full grid-cols-3 rounded-[7px] bg-white p-0.5 ring-1 ring-[#dfe4ee] dark:bg-[#0b1523] dark:ring-[#263a55]"
                  aria-label="Filter by report status"
                  role="group"
                >
                  {statusFilterOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        "rounded-[6px] px-2 text-xs font-semibold text-[#64748b] transition-colors hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:text-muted-foreground dark:hover:text-foreground",
                        statusFilter === option.value &&
                          "bg-[#eff6ff] text-[#2563eb] dark:bg-blue-400/10 dark:text-[#93c5fd]",
                      )}
                      onClick={() => setStatusFilter(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {hasActiveTableControls ? (
                  <button
                    type="button"
                    className="h-10 rounded-[7px] px-2 text-xs font-semibold text-[#64748b] transition-colors hover:bg-[#f1f5f9] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground"
                    onClick={clearTableControls}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
            <div
              aria-label="Employee reports table viewport"
              className="reference-paginated-viewport reference-visible-rows-viewport reference-review-table-viewport px-3"
            >
              <table className="w-full table-fixed text-xs">
                <thead className="sticky top-0 z-10 bg-white dark:bg-[#0f1b2a]">
                  <tr className="border-b border-[#e5eaf2] text-left text-[10px] font-semibold uppercase tracking-[0.02em] text-[#64748b] dark:border-[#263a55] dark:text-muted-foreground">
                    <th className="w-[32px] px-1 py-2 min-[700px]:w-[36px] min-[700px]:px-2">
                      <Checkbox
                        checked={allVisibleReportsSelected}
                        disabled={visibleReportIds.length === 0}
                        onChange={(event) =>
                          toggleVisibleSelection(event.target.checked)
                        }
                        aria-label="Select visible reports"
                      />
                    </th>
                    <th
                      className="w-[43%] px-2 py-2 min-[700px]:w-[30%] min-[980px]:w-[24%] min-[1180px]:w-[22%]"
                      aria-sort={sortAriaValue(sortState, "employee")}
                    >
                      <SortableHeader
                        label="Employee"
                        sortKey="employee"
                        sortState={sortState}
                        onSort={toggleEmployeeSort}
                      />
                    </th>
                    <th
                      className="hidden w-[15%] px-2 py-2 min-[760px]:table-cell"
                      aria-sort={sortAriaValue(sortState, "department")}
                    >
                      <SortableHeader
                        label="Department"
                        sortKey="department"
                        sortState={sortState}
                        onSort={toggleEmployeeSort}
                      />
                    </th>
                    <th
                      className="w-[24%] px-2 py-2 min-[700px]:w-[16%] min-[980px]:w-[12%]"
                      aria-sort={sortAriaValue(sortState, "status")}
                    >
                      <SortableHeader
                        label="Status"
                        sortKey="status"
                        sortState={sortState}
                        onSort={toggleEmployeeSort}
                      />
                    </th>
                    <th
                      className="hidden w-[16%] px-2 py-2 min-[1180px]:table-cell"
                      aria-sort={sortAriaValue(sortState, "flags")}
                    >
                      <SortableHeader
                        label="Flags"
                        sortKey="flags"
                        sortState={sortState}
                        onSort={toggleEmployeeSort}
                      />
                    </th>
                    <th
                      className="hidden w-[12%] px-2 py-2 min-[980px]:table-cell"
                      aria-sort={sortAriaValue(sortState, "location")}
                    >
                      <SortableHeader
                        label="Location"
                        sortKey="location"
                        sortState={sortState}
                        onSort={toggleEmployeeSort}
                      />
                    </th>
                    <th
                      className="hidden w-[16%] px-2 py-2 min-[700px]:table-cell min-[980px]:w-[14%]"
                      aria-sort={sortAriaValue(sortState, "submitted")}
                    >
                      <SortableHeader
                        label="Submitted"
                        sortKey="submitted"
                        sortState={sortState}
                        onSort={toggleEmployeeSort}
                      />
                    </th>
                    <th className="w-[58px] px-1 py-2 text-right min-[700px]:w-[68px] min-[700px]:px-2">
                      <span className="whitespace-nowrap">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8">
                        <EmptyReferenceState>
                          No employee reports match this search.
                        </EmptyReferenceState>
                      </td>
                    </tr>
                  ) : (
                    pagedItems.map((row) => {
                      const status = reportStatus(row, date);
                      const canReview = canReviewReport(row);
                      const blockedReason =
                        row.report?.status === "DRAFT"
                          ? "Drafts are private until submitted"
                          : "No report has been submitted yet";
                      const unavailablePulse =
                        blockedOpenUserId === row.user.id;
                      const flags = canReview ? dashboardFlags(row, date) : [];
                      const unread =
                        canUseReviewerActions &&
                        canReview &&
                        isUnreadForReviewer(row.report, reviewerId);

                      return (
                        <tr
                          key={row.user.id}
                          title={
                            canReview
                              ? `Open report for ${row.user.name ?? row.user.email ?? "employee"}`
                              : blockedReason
                          }
                          className={cn(
                            "h-14 border-b border-[#e5eaf2] text-[#344054] transition-colors last:border-b-0 hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563eb] dark:border-[#263a55] dark:text-muted-foreground dark:hover:bg-white/[0.04]",
                            canReview && "cursor-pointer",
                            unread && "bg-[#f4f8ff] dark:bg-blue-400/10",
                          )}
                          onClick={() => {
                            if (canReview) {
                              openReport(row);
                              return;
                            }

                            nudgeUnavailableReport(row);
                          }}
                        >
                          <td className="px-1 py-2.5 min-[700px]:px-2">
                            {canUseReviewerActions &&
                            canReview &&
                            row.report ? (
                              <Checkbox
                                checked={selectedReportIds.includes(
                                  row.report.id,
                                )}
                                onChange={(event) =>
                                  toggleReportSelection(
                                    row.report!.id,
                                    event.target.checked,
                                  )
                                }
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                                aria-label={`Select ${row.user.name ?? row.user.email ?? "report"}`}
                              />
                            ) : null}
                          </td>
                          <td className="min-w-0 px-2 py-2.5">
                            <div className="flex min-w-0 items-center gap-2 min-[700px]:gap-3">
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-full",
                                  unread ? "bg-[#2563eb]" : "bg-transparent",
                                )}
                              />
                              <Avatar name={row.user.name ?? row.user.email} />
                              <span className="min-w-0 truncate text-xs font-semibold text-[#101828] dark:text-foreground">
                                {row.user.name ?? row.user.email ?? "Employee"}
                              </span>
                            </div>
                          </td>
                          <td className="hidden px-2 py-2.5 text-xs text-[#475467] dark:text-muted-foreground min-[760px]:table-cell">
                            {userDepartmentLabel(row.user)}
                          </td>
                          <td className="px-2 py-2.5">
                            <ReportStatusBadge
                              status={status}
                              className="px-2.5 py-1 text-[11px] font-semibold"
                            />
                          </td>
                          <td className="hidden px-2 py-2.5 min-[1180px]:table-cell">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              {flags.length === 0 ? (
                                <span className="text-[#98a2b3]">-</span>
                              ) : (
                                flags.map((flag) => (
                                  <span
                                    key={flag.key}
                                    title={flag.label}
                                    className={cn(
                                      "inline-flex h-6 w-6 items-center justify-center rounded-full border bg-white [&_svg]:h-3.5 [&_svg]:w-3.5 dark:bg-[#0b1523]",
                                      flag.key === "activities" &&
                                        "border-blue-200 text-[#2563eb] dark:border-blue-300/25",
                                      flag.key === "edited" &&
                                        "border-purple-200 text-[#8b5cf6] dark:border-purple-300/25",
                                      flag.key === "late" &&
                                        "border-red-200 text-[#ef4444] dark:border-red-300/25",
                                    )}
                                  >
                                    {flag.icon}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="hidden px-2 py-2.5 text-xs min-[980px]:table-cell">
                            {canReview && row.report
                              ? workLocationLabel(row.report.workLocation)
                              : "-"}
                          </td>
                          <td className="hidden px-2 py-2.5 text-xs min-[700px]:table-cell">
                            {formatTimestamp(row.report?.submittedAt)}
                          </td>
                          <td className="px-1 py-2.5 text-right min-[700px]:px-2">
                            <div
                              className="relative ml-auto flex w-9 items-center justify-end"
                              data-testid="employee-report-row-actions"
                            >
                              {unavailablePulse ? (
                                <span
                                  className="reference-lock-nudge pointer-events-none absolute -left-7 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-[#eef2f7] text-[#64748b] dark:bg-white/10 dark:text-muted-foreground"
                                  aria-hidden="true"
                                >
                                  <Lock className="h-3.5 w-3.5" />
                                </span>
                              ) : null}
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-[7px] bg-[#f4f7fb] p-0 text-[#64748b] hover:text-[#2563eb]"
                                aria-label={`More actions for ${employeeLabel(row)}`}
                                aria-haspopup="menu"
                                aria-expanded={
                                  rowActionMenu?.userId === row.user.id
                                }
                                onClick={(event) =>
                                  toggleRowActionMenu(row, event)
                                }
                                onKeyDown={(event) => event.stopPropagation()}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              className="reference-paginated-footer px-3 pb-3 pt-5"
              page={currentEmployeePage}
              pageSize={employeePageSize}
              pageSizeMenuPlacement="top"
              totalItems={filteredItems.length}
              itemLabel="employee reports"
              onPageChange={setEmployeePage}
              onPageSizeChange={(nextPageSize) => {
                setEmployeePageSize(nextPageSize);
                setEmployeePage(1);
              }}
            />
          </ReportSurface>
        </main>
      )}
      {menuRow && rowActionMenu ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            aria-label="Close employee report menu"
            onClick={() => setRowActionMenu(null)}
          />
          <div
            ref={rowActionMenuRef}
            className="fixed z-50 max-h-[calc(100dvh-1.5rem)] w-[220px] overflow-y-auto overscroll-contain rounded-[10px] bg-white p-1 text-sm shadow-[0_18px_42px_rgba(15,23,42,0.22)] ring-1 ring-[#e1e6ef] [scrollbar-gutter:stable] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
            style={{ top: rowActionMenu.top, left: rowActionMenu.left }}
            role="menu"
          >
            {canReviewReport(menuRow) ? (
              <ReviewerRowMenuButton
                icon={<FileText />}
                onClick={() => {
                  setRowActionMenu(null);
                  openReport(menuRow);
                }}
              >
                Open report
              </ReviewerRowMenuButton>
            ) : null}
            <ReviewerRowMenuButton
              icon={<CalendarRange />}
              onClick={() => {
                setRowActionMenu(null);
                void openWeeklyReport(menuRow);
              }}
            >
              Weekly report
            </ReviewerRowMenuButton>
            <ReviewerRowMenuButton
              icon={<History />}
              onClick={() => {
                setRowActionMenu(null);
                void openWeeklyReportArchive(menuRow);
              }}
            >
              View saved reports
            </ReviewerRowMenuButton>
            {canUseReviewerActions && !menuRow.report ? (
              <ReviewerRowMenuButton
                icon={
                  remindingUserId === menuRow.user.id ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Mail />
                  )
                }
                disabled={remindingUserId !== null}
                onClick={() => {
                  setRowActionMenu(null);
                  void sendReportReminder(menuRow);
                }}
              >
                {remindingUserId === menuRow.user.id
                  ? "Sending reminder"
                  : "Send reminder"}
              </ReviewerRowMenuButton>
            ) : null}
            {canUseReviewerActions && canReviewReport(menuRow) ? (
              <ReviewerRowMenuButton
                icon={
                  isUnreadForReviewer(menuRow.report, reviewerId) ? (
                    <Eye />
                  ) : (
                    <EyeOff />
                  )
                }
                onClick={() => {
                  const read = isUnreadForReviewer(menuRow.report, reviewerId);
                  setRowActionMenu(null);
                  void setReadState(menuRow, read);
                }}
              >
                {isUnreadForReviewer(menuRow.report, reviewerId)
                  ? "Mark as read"
                  : "Mark as unread"}
              </ReviewerRowMenuButton>
            ) : null}
            {canAdminManageReports && menuRow.report?.status === "SUBMITTED" ? (
              <>
                <div className="mx-2 my-1 border-t border-[#e5eaf2] dark:border-[#263a55]" />
                <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748b] dark:text-muted-foreground">
                  Admin actions
                </div>
                <ReviewerRowMenuButton
                  icon={
                    adminReportAction?.reportId === menuRow.report.id &&
                    adminReportAction.action === "reopen" ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RotateCcw />
                    )
                  }
                  disabled={adminReportAction !== null}
                  onClick={() => {
                    void reopenSubmittedReport(menuRow);
                  }}
                >
                  Reopen to draft
                </ReviewerRowMenuButton>
                <ReviewerRowMenuButton
                  icon={
                    adminReportAction?.reportId === menuRow.report.id &&
                    adminReportAction.action === "delete" ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )
                  }
                  disabled={adminReportAction !== null}
                  tone="danger"
                  onClick={() => {
                    void deleteSubmittedReport(menuRow);
                  }}
                >
                  Delete report
                </ReviewerRowMenuButton>
              </>
            ) : null}
          </div>
        </>
      ) : null}
      <FixedToast message={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}

function setLocalReadReceipt(
  rows: Row[],
  reportId: string,
  reviewerId: string,
  read: boolean,
) {
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
              ...existingReceipts.filter(
                (receipt) => receipt.reviewerId !== reviewerId,
              ),
              {
                reviewerId,
                readAt: new Date().toISOString(),
              },
            ]
          : existingReceipts.filter(
              (receipt) => receipt.reviewerId !== reviewerId,
            ),
      },
    };
  });
}

type LocationMetricTone =
  | "blue"
  | "green"
  | "purple"
  | "yellow"
  | "red"
  | "neutral";

function LocationCountChip({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: LocationMetricTone;
}) {
  const percent = percentage(count, total);
  const toneClass = {
    blue: "bg-[#f8fbff] text-[#1d4ed8] ring-[#dbe7f5] dark:bg-blue-400/10 dark:text-blue-100 dark:ring-blue-300/15",
    green:
      "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-300/15",
    purple:
      "bg-[#f8f3ff] text-[#7c3aed] ring-[#eadcff] dark:bg-purple-400/10 dark:text-purple-100 dark:ring-purple-300/15",
    yellow:
      "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-300/20",
    red: "bg-[#fff5f5] text-[#dc2626] ring-[#f5d7dc] dark:bg-red-400/10 dark:text-red-100 dark:ring-red-300/15",
    neutral:
      "bg-[#f8fafc] text-[#475467] ring-[#e5eaf2] dark:bg-white/[0.04] dark:text-muted-foreground dark:ring-[#263a55]",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ring-1",
        toneClass,
      )}
    >
      <span>{label}</span>
      <span className="text-sm leading-none">{count}</span>
      {total > 0 ? <span className="opacity-75">{percent}%</span> : null}
    </span>
  );
}

function WorkLocationBreakdown({
  breakdown,
}: {
  breakdown: WorkLocationBreakdownData;
}) {
  const warning = wfhWarning(breakdown);
  const wfhTone: LocationMetricTone =
    warning?.tone === "red"
      ? "red"
      : warning?.tone === "yellow"
        ? "yellow"
        : "green";
  const submittedLabel =
    breakdown.totalSubmitted === 1
      ? "1 submitted report"
      : `${breakdown.totalSubmitted} submitted reports`;
  const excludedLabels = [
    breakdown.draft
      ? `${breakdown.draft} draft${breakdown.draft === 1 ? "" : "s"}`
      : null,
    breakdown.missing ? `${breakdown.missing} missing` : null,
  ].filter(Boolean);
  const secondaryLocations = (
    ["HYBRID", "PTO", "OUT_OF_OFFICE", "UNKNOWN"] as WorkLocationKey[]
  ).filter((location) => breakdown.counts[location] > 0);
  const primaryLocations: Array<{
    location: WorkLocationKey;
    tone: LocationMetricTone;
  }> = [
    { location: "OFFICE", tone: "blue" },
    { location: "WFH", tone: wfhTone },
    { location: "OFFICE_AM_WFH_PM", tone: "purple" },
    { location: "WFH_AM_OFFICE_PM", tone: "purple" },
  ];

  return (
    <section
      aria-label="Work location breakdown"
      className="mt-3 border-t border-[#e5eaf2] pt-2.5 dark:border-[#263a55]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="text-sm font-semibold text-[#101828] dark:text-foreground">
            Work location breakdown
          </h3>
          <span className="text-xs text-[#64748b] dark:text-muted-foreground">
            {submittedLabel}
          </span>
        </div>
        {warning ? (
          <span
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ring-1",
              warning.tone === "red"
                ? "bg-[#fff5f5] text-[#dc2626] ring-[#f5d7dc] dark:bg-red-400/10 dark:text-red-100 dark:ring-red-300/15"
                : "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-300/20",
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {warning.label}
            <span className="font-bold">{warning.percent}% WFH</span>
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[#64748b] dark:text-muted-foreground">
        {primaryLocations.map(({ location, tone }) => (
          <LocationCountChip
            key={location}
            label={workLocationLabel(location)}
            count={breakdown.counts[location]}
            total={breakdown.totalSubmitted}
            tone={tone}
          />
        ))}
        {secondaryLocations.length > 0 || excludedLabels.length > 0 ? (
          <>
            {secondaryLocations.map((location) => (
              <span
                key={location}
                className="inline-flex h-7 items-center rounded-full bg-[#f8fafc] px-2.5 font-semibold ring-1 ring-[#e5eaf2] dark:bg-white/[0.04] dark:ring-[#263a55]"
              >
                {workLocationLabel(location)}: {breakdown.counts[location]}
              </span>
            ))}
            {excludedLabels.length > 0 ? (
              <span className="ml-1 font-medium">
                {excludedLabels.join(", ")} not counted
              </span>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

function WeeklyWorkLocationBreakdown({
  breakdown,
}: {
  breakdown: WorkLocationBreakdownData;
}) {
  const warning = wfhWarning(breakdown);
  const wfhTone: LocationMetricTone =
    warning?.tone === "red"
      ? "red"
      : warning?.tone === "yellow"
        ? "yellow"
        : "green";
  const submittedLabel =
    breakdown.totalSubmitted === 1
      ? "1 submitted day"
      : `${breakdown.totalSubmitted} submitted days`;
  const excludedLabels = [
    breakdown.draft
      ? `${breakdown.draft} draft${breakdown.draft === 1 ? "" : "s"}`
      : null,
    breakdown.missing
      ? `${breakdown.missing} missing day${breakdown.missing === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  const secondaryLocations = (
    ["HYBRID", "PTO", "OUT_OF_OFFICE", "UNKNOWN"] as WorkLocationKey[]
  ).filter((location) => breakdown.counts[location] > 0);
  const primaryLocations: Array<{
    location: WorkLocationKey;
    tone: LocationMetricTone;
  }> = [
    { location: "OFFICE", tone: "blue" },
    { location: "WFH", tone: wfhTone },
    { location: "OFFICE_AM_WFH_PM", tone: "purple" },
    { location: "WFH_AM_OFFICE_PM", tone: "purple" },
  ];

  return (
    <section
      aria-label="Weekly work location breakdown"
      className="report-pdf-card mt-5 rounded-[10px] border border-[#dbe3ee] bg-[#f8fbff] p-4 dark:border-[#263a55] dark:bg-white/[0.03]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h2 className="text-sm font-semibold text-[#101828] dark:text-foreground">
            Weekly location breakdown
          </h2>
          <span className="text-xs text-[#64748b] dark:text-muted-foreground">
            {submittedLabel}
          </span>
        </div>
        {warning ? (
          <span
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ring-1",
              warning.tone === "red"
                ? "bg-[#fff5f5] text-[#dc2626] ring-[#f5d7dc] dark:bg-red-400/10 dark:text-red-100 dark:ring-red-300/15"
                : "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-300/20",
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {warning.label}
            <span className="font-bold">{warning.percent}% WFH</span>
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[#64748b] dark:text-muted-foreground">
        {primaryLocations.map(({ location, tone }) => (
          <LocationCountChip
            key={location}
            label={workLocationLabel(location)}
            count={breakdown.counts[location]}
            total={breakdown.totalSubmitted}
            tone={tone}
          />
        ))}
        {secondaryLocations.map((location) => (
          <span
            key={location}
            className="inline-flex h-7 items-center rounded-full bg-white px-2.5 font-semibold ring-1 ring-[#e5eaf2] dark:bg-white/[0.04] dark:ring-[#263a55]"
          >
            {workLocationLabel(location)}: {breakdown.counts[location]}
          </span>
        ))}
        {excludedLabels.length > 0 ? (
          <span className="ml-1 font-medium">
            {excludedLabels.join(", ")} not counted
          </span>
        ) : null}
      </div>
    </section>
  );
}

function CompactMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "red" | "purple";
}) {
  const toneClass = {
    blue: "bg-[#f4f8ff] text-[#1d4ed8] ring-[#dbe7f5] dark:bg-blue-400/10 dark:text-blue-100 dark:ring-blue-300/15",
    red: "bg-[#fff5f5] text-[#dc2626] ring-[#f5d7dc] dark:bg-red-400/10 dark:text-red-100 dark:ring-red-300/15",
    purple:
      "bg-[#f8f3ff] text-[#7c3aed] ring-[#eadcff] dark:bg-purple-400/10 dark:text-purple-100 dark:ring-purple-300/15",
  }[tone];

  return (
    <div
      className={cn(
        "flex min-w-[86px] items-baseline justify-between gap-3 rounded-[8px] px-3 py-2 ring-1",
        toneClass,
      )}
    >
      <div className="text-xs font-semibold">{label}</div>
      <div className="text-lg font-semibold leading-none">{value}</div>
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

function weeklyActivityStatusLabel(activity: DashboardActivity) {
  const status = activity.status?.trim();

  if (!status || status.toLowerCase() === "noted") {
    return null;
  }

  return titleCase(status);
}

function WeeklyProgressRing({
  submittedCount,
  expectedDays,
}: {
  submittedCount: number;
  expectedDays: number;
}) {
  const progress = expectedDays
    ? Math.min(100, Math.round((submittedCount / expectedDays) * 100))
    : 0;

  return (
    <div
      className="relative flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(#198754 ${progress * 3.6}deg, #e8eef6 0deg)`,
      }}
      aria-label={`${submittedCount} of ${expectedDays} submitted`}
    >
      <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-white text-sm font-semibold text-[#0f172a] dark:bg-[#0f1b2a] dark:text-foreground">
        {submittedCount}/{expectedDays}
      </div>
    </div>
  );
}

function WeeklyReportDayTabs({
  weekDates,
  reportsByDate,
  selectedDate,
  submittedCount,
  expectedDays,
  onSelect,
}: {
  weekDates: string[];
  reportsByDate: Map<string, DashboardReport>;
  selectedDate: string;
  submittedCount: number;
  expectedDays: number;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="grid gap-4 min-[720px]:grid-cols-4 min-[1120px]:grid-cols-[repeat(7,minmax(0,1fr))_minmax(230px,1.9fr)]">
      {weekDates.map((weekDate) => {
        const selected = weekDate === selectedDate;

        return (
          <button
            key={weekDate}
            type="button"
            className={cn(
              "relative flex h-[76px] min-w-0 flex-col items-center justify-center rounded-[10px] border px-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]",
              selected
                ? "border-[#8ab7ff] bg-[#eff6ff] text-[#0b63e5] shadow-[0_10px_22px_rgba(37,99,235,0.08)] dark:border-blue-300/30 dark:bg-blue-400/10 dark:text-blue-100"
                : "border-[#dbe3ee] bg-white text-[#0f172a] hover:border-[#b7c8df] hover:bg-[#fbfdff] dark:border-[#263a55] dark:bg-[#0f1b2a] dark:text-foreground dark:hover:bg-white/[0.06]",
            )}
            aria-pressed={selected}
            aria-label={`${formatWeekdayShortDate(weekDate)} ${
              reportsByDate.has(weekDate) ? "Submitted" : "Missing"
            }`}
            onClick={() => onSelect(weekDate)}
          >
            <span className="text-[15px] font-semibold leading-5">
              {formatWeekdayOnly(weekDate)}
            </span>
            <span
              className={cn(
                "mt-1 text-[13px] font-medium leading-5",
                selected
                  ? "text-[#0b63e5] dark:text-blue-100"
                  : "text-[#52647a] dark:text-muted-foreground",
              )}
            >
              {formatMonthDay(weekDate)}
            </span>
            {selected ? (
              <span
                className="absolute inset-x-0 -bottom-2 h-1 rounded-full bg-[#0b63e5]"
                aria-hidden="true"
              />
            ) : null}
          </button>
        );
      })}

      <div className="flex min-h-[76px] items-center gap-4 rounded-[10px] border border-[#dbe3ee] bg-white px-5 py-3 dark:border-[#263a55] dark:bg-[#0f1b2a] min-[720px]:col-span-2 min-[1120px]:col-span-1">
        <WeeklyProgressRing
          submittedCount={submittedCount}
          expectedDays={expectedDays}
        />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[#0f172a] dark:text-foreground">
            {submittedCount} of {expectedDays} submitted
          </p>
          <p className="mt-1 text-[13px] leading-5 text-[#52647a] dark:text-muted-foreground">
            Keep it up. You&apos;re on track.
          </p>
        </div>
      </div>
    </div>
  );
}

function WeeklyDayMeta({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-[#dbe3ee] py-2 dark:border-[#263a55] min-[700px]:border-r min-[700px]:pr-8 min-[700px]:last:border-r-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center text-[#52647a] [&_svg]:h-5 [&_svg]:w-5 dark:text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-[13px] font-medium leading-5 text-[#52647a] dark:text-muted-foreground">
          {label}
        </dt>
        <dd className="truncate text-[15px] font-medium leading-6 text-[#0f172a] dark:text-foreground">
          {value}
        </dd>
      </div>
    </div>
  );
}

function WeeklyDayActivities({
  activities,
}: {
  activities: DashboardActivity[];
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-3">
        <ListChecks className="h-5 w-5 text-[#0b63e5]" aria-hidden="true" />
        <h4 className="text-[17px] font-semibold text-[#0f172a] dark:text-foreground">
          Activities
        </h4>
      </div>
      <div className="mt-4 border-t border-[#dbe3ee] dark:border-[#263a55]">
        {activities.length ? (
          <ul className="divide-y divide-[#e6edf6] dark:divide-[#263a55]">
            {activities.map((activity) => {
              const statusLabel = weeklyActivityStatusLabel(activity);

              return (
                <li
                  key={activity.id}
                  className="grid min-w-0 gap-3 py-4 min-[640px]:grid-cols-[minmax(0,1fr)_72px_94px] min-[640px]:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ReportActivitySourceIcon
                      source={activity.source}
                      size="sm"
                      className="weekly-report-source-icon report-pdf-source-icon"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold leading-5 text-[#0f172a] dark:text-foreground">
                        {activity.title || "Untitled activity"}
                      </p>
                      <p className="mt-0.5 truncate text-[13px] leading-5 text-[#52647a] dark:text-muted-foreground">
                        {reportActivitySourceLabel(activity.source)}
                      </p>
                    </div>
                  </div>
                  <div className="text-[14px] font-medium text-[#0f172a] dark:text-foreground">
                    {formatReportDuration(activity.durationMinutes)}
                  </div>
                  {statusLabel ? (
                    <span className="inline-flex h-7 w-fit items-center rounded-full bg-emerald-50 px-3 text-[13px] font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                      {statusLabel}
                    </span>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-5 text-[14px] leading-6 text-[#52647a] dark:text-muted-foreground">
            No activities selected.
          </p>
        )}
      </div>
    </div>
  );
}

function WeeklyReportDayCard({
  weekDate,
  report,
  activityReferences,
}: {
  weekDate: string;
  report?: DashboardReport | null;
  activityReferences: SummaryActivityReferenceMap;
}) {
  const dayActivities = includedActivities(report ?? null);

  return (
    <section className="weekly-report-day report-pdf-card overflow-hidden rounded-[10px] border border-[#dbe3ee] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.07)] dark:border-[#263a55] dark:bg-[#0f1b2a]">
      <div className="px-6 py-6 min-[900px]:px-7">
        <div className="flex flex-wrap items-center gap-4">
          <h3 className="text-[24px] font-semibold leading-tight text-[#0f172a] dark:text-foreground">
            {formatFullWeekdayDate(weekDate)}
          </h3>
          <ReportStatusBadge
            status={report ? "Submitted" : "Missing"}
            className="h-8 px-3 text-[14px] font-semibold"
            showIcon
          />
        </div>

        <dl className="mt-6 grid gap-x-8 gap-y-3 border-t border-[#dbe3ee] pt-5 dark:border-[#263a55] min-[700px]:grid-cols-3">
          <WeeklyDayMeta
            icon={<MapPin />}
            label="Location"
            value={report ? workLocationLabel(report.workLocation) : "-"}
          />
          <WeeklyDayMeta
            icon={<Clock3 />}
            label="Submitted"
            value={report ? formatTimestamp(report.submittedAt) : "-"}
          />
          <WeeklyDayMeta
            icon={<ListChecks />}
            label="Activities"
            value={dayActivities.length}
          />
        </dl>
      </div>

      <div className="grid border-t border-[#dbe3ee] dark:border-[#263a55] min-[960px]:grid-cols-[minmax(0,1fr)_minmax(360px,1.05fr)]">
        <div className="min-w-0 px-6 py-6 dark:bg-[#0f1b2a] min-[900px]:px-7 min-[960px]:border-r min-[960px]:border-[#dbe3ee] min-[960px]:dark:border-[#263a55]">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-[#0b63e5]" aria-hidden="true" />
            <h4 className="text-[17px] font-semibold text-[#0f172a] dark:text-foreground">
              Summary
            </h4>
          </div>
          <div className="mt-4 border-t border-[#dbe3ee] pt-5 text-[15px] leading-7 text-[#0f172a] dark:border-[#263a55] dark:text-foreground">
            {report ? (
              <SummaryRenderer
                value={report.summary}
                activityReferences={activityReferences}
                emptyText="No summary recorded."
              />
            ) : (
              <p className="text-[#52647a] dark:text-muted-foreground">
                Nothing to summarize for this day.
              </p>
            )}
          </div>
        </div>

        <div className="min-w-0 px-6 py-6 min-[900px]:px-7">
          <WeeklyDayActivities activities={dayActivities} />
        </div>
      </div>
    </section>
  );
}

function WeeklyReportArchivePage({
  state,
  onBack,
  onOpenReport,
}: {
  state: WeeklyReportArchiveState;
  onBack: () => void;
  onOpenReport: (
    report: WeeklyReportSummary,
    employee: DashboardUser,
  ) => Promise<void>;
}) {
  return (
    <main className="reference-page min-[1024px]:flex min-[1024px]:h-full min-[1024px]:min-h-0 min-[1024px]:flex-col">
      <button
        className="mb-3 inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]"
        onClick={onBack}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to review dashboard
      </button>
      <ReportSurface className="mx-auto max-w-[980px] min-[1024px]:flex min-[1024px]:min-h-0 min-[1024px]:w-full min-[1024px]:flex-1 min-[1024px]:flex-col">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e5eaf2] pb-4 dark:border-[#263a55]">
          <div>
            <h1 className="text-[24px] font-semibold leading-tight text-[#101828] dark:text-foreground">
              Saved Weekly Reports
            </h1>
            <p className="mt-1 text-sm text-[#52647a] dark:text-muted-foreground">
              {userLabel(state.employee)}
            </p>
          </div>
        </div>

        {state.status === "loading" ? (
          <div className="flex min-h-[220px] items-center justify-center text-center">
            <div>
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#2563eb]" />
              <p className="mt-3 text-sm font-medium text-[#52647a] dark:text-muted-foreground">
                Loading saved weekly reports
              </p>
            </div>
          </div>
        ) : state.status === "error" ? (
          <div className="py-8">
            <EmptyReferenceState>{state.message}</EmptyReferenceState>
          </div>
        ) : state.reports.length ? (
          <div className="mt-4 divide-y divide-[#e5eaf2] overflow-hidden rounded-[10px] border border-[#dbe3ee] dark:divide-[#263a55] dark:border-[#263a55] min-[1024px]:min-h-0 min-[1024px]:flex-1 min-[1024px]:overflow-y-auto min-[1024px]:overscroll-contain min-[1024px]:[scrollbar-gutter:stable]">
            {state.reports.map((report) => (
              <div
                key={report.id}
                className="grid gap-3 bg-white px-4 py-4 dark:bg-[#0f1b2a] min-[760px]:grid-cols-[minmax(0,1fr)_auto] min-[760px]:items-center"
              >
                <div className="min-w-0">
                  <p className="text-base font-semibold text-[#0f172a] dark:text-foreground">
                    {formatWeekRange(report.weekStart, report.weekEnd)}
                  </p>
                  <p className="mt-1 text-sm text-[#52647a] dark:text-muted-foreground">
                    {report.submittedCount} of {report.expectedDays} submitted -{" "}
                    {report.activityCount} activities - Generated{" "}
                    {formatTimestamp(report.generatedAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-[8px] bg-white px-4 text-sm font-semibold text-[#2563eb] dark:bg-[#0b1523]"
                  onClick={() => {
                    void onOpenReport(report, state.employee);
                  }}
                >
                  View report
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8">
            <EmptyReferenceState>
              No saved weekly reports yet. Generate one from the employee
              actions menu first.
            </EmptyReferenceState>
          </div>
        )}
      </ReportSurface>
    </main>
  );
}

function WeeklyReportReviewPage({
  state,
  onBack,
  onPrint,
}: {
  state: WeeklyReportState;
  onBack: () => void;
  onPrint: () => void;
}) {
  const [selectedWeekDate, setSelectedWeekDate] = useState<string | null>(null);

  if (state.status !== "ready") {
    return (
      <main className="reference-page report-pdf-page weekly-report-pdf min-[1024px]:flex min-[1024px]:h-full min-[1024px]:min-h-0 min-[1024px]:flex-col">
        <button
          className="report-pdf-back mb-3 inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to review dashboard
        </button>
        <ReportSurface className="mx-auto flex min-h-[260px] max-w-[980px] items-center justify-center">
          <div className="text-center">
            {state.status === "loading" ? (
              <>
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#2563eb]" />
                <h1 className="mt-4 text-lg font-semibold text-[#101828] dark:text-foreground">
                  Loading weekly report
                </h1>
                <p className="mt-1 text-sm text-[#667085] dark:text-muted-foreground">
                  {userLabel(state.employee)}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-lg font-semibold text-[#101828] dark:text-foreground">
                  Unable to load weekly report
                </h1>
                <p className="mt-1 text-sm text-[#667085] dark:text-muted-foreground">
                  {state.message}
                </p>
              </>
            )}
          </div>
        </ReportSurface>
      </main>
    );
  }

  const { data } = state;
  const reports = [...data.reports].sort((first, second) =>
    dateInputValue(first.reportDate ?? data.weekStart).localeCompare(
      dateInputValue(second.reportDate ?? data.weekStart),
    ),
  );
  const weekDates = reportWeekDates(data.weekStart, data.weekEnd);
  const reportsByDate = new Map(
    reports.map((report) => [
      dateInputValue(report.reportDate ?? data.weekStart),
      report,
    ]),
  );
  const selectedDayDate =
    selectedWeekDate && weekDates.includes(selectedWeekDate)
      ? selectedWeekDate
      : (weekDates[0] ?? dateInputValue(data.weekStart));
  const selectedDayReport = reportsByDate.get(selectedDayDate);
  const submittedCount = data.submittedCount ?? reports.length;
  const expectedDays = data.expectedDays ?? weekDates.length;
  const weeklyLocationBreakdown = weeklyWorkLocationBreakdown(
    reports,
    expectedDays,
  );
  const weeklyActivityCount =
    data.activityCount ??
    reports.reduce(
      (count, report) => count + includedActivities(report).length,
      0,
    );
  const activityReferences = Object.fromEntries(
    reports.flatMap((report) =>
      report.activities.map((activity) => [
        activity.id,
        {
          href: activity.sourceUrl,
          source: activity.source,
          title: activity.title,
        },
      ]),
    ),
  );

  return (
    <main className="reference-page report-pdf-page weekly-report-pdf bg-[#f6f9fd] dark:bg-background min-[1024px]:flex min-[1024px]:h-full min-[1024px]:min-h-0 min-[1024px]:flex-col">
      <div className="mx-auto max-w-[1280px] min-[1024px]:min-h-0 min-[1024px]:w-full min-[1024px]:flex-1 min-[1024px]:overflow-y-auto min-[1024px]:overscroll-contain min-[1024px]:pr-1 min-[1024px]:[scrollbar-gutter:stable]">
        <button
          className="report-pdf-back mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to review dashboard
        </button>

        <article className="report-pdf-document weekly-report-document rounded-[12px] border border-[#dbe3ee] bg-white p-6 shadow-[0_16px_46px_rgba(15,23,42,0.08)] dark:border-[#263a55] dark:bg-[#0f1b2a] min-[900px]:p-9">
          <header className="report-pdf-header flex flex-col gap-4 border-b border-[#dbe3ee] pb-8 dark:border-[#263a55] min-[720px]:flex-row min-[720px]:items-start min-[720px]:justify-between">
            <div className="flex min-w-0 items-center gap-5">
              <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[12px] bg-[#eef6ff] text-[#0b63e5] dark:bg-blue-400/10 dark:text-blue-100">
                <FileText className="h-7 w-7" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h1 className="text-[28px] font-semibold leading-tight text-[#07152e] dark:text-foreground min-[900px]:text-[30px]">
                  Weekly Report
                </h1>
                <p className="mt-1 text-[18px] font-medium leading-6 text-[#52647a] dark:text-muted-foreground">
                  {formatWeekRange(data.weekStart, data.weekEnd)}
                </p>
                <p className="mt-1 text-sm text-[#64748b] dark:text-muted-foreground">
                  {userLabel(data.employee)}
                </p>
              </div>
            </div>

            <div className="report-pdf-actions">
              <Button
                variant="outline"
                className="h-12 rounded-[9px] bg-white px-5 text-[15px] font-semibold text-[#0b63e5] ring-1 ring-[#cbd9ea] hover:bg-[#f8fbff] dark:bg-[#0b1523] dark:ring-[#263a55]"
                onClick={onPrint}
              >
                <Download className="mr-2 h-5 w-5" />
                Download PDF
              </Button>
            </div>
          </header>

          <WeeklyWorkLocationBreakdown breakdown={weeklyLocationBreakdown} />

          <div className="report-pdf-screen-only mt-6">
            <WeeklyReportDayTabs
              weekDates={weekDates}
              reportsByDate={reportsByDate}
              selectedDate={selectedDayDate}
              submittedCount={submittedCount}
              expectedDays={expectedDays}
              onSelect={setSelectedWeekDate}
            />
            <div className="mt-8">
              <WeeklyReportDayCard
                weekDate={selectedDayDate}
                report={selectedDayReport}
                activityReferences={activityReferences}
              />
            </div>
          </div>

          <div className="report-pdf-print-only mt-6 space-y-5">
            {weekDates.map((weekDate) => (
              <WeeklyReportDayCard
                key={weekDate}
                weekDate={weekDate}
                report={reportsByDate.get(weekDate)}
                activityReferences={activityReferences}
              />
            ))}
          </div>

          <footer className="report-pdf-footer mt-8 flex flex-wrap items-center justify-between gap-4 text-[14px] font-medium text-[#52647a] dark:text-muted-foreground">
            <span className="inline-flex items-center gap-3">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              Only visible to reviewers and admins
            </span>
            <span>
              {weeklyActivityCount} activities - Generated on{" "}
              {formatShortDate(data.generatedAt ?? new Date())}
            </span>
          </footer>
        </article>
      </div>
    </main>
  );
}

function ReportReviewPage({
  row,
  date,
  canAddReviewNote,
  onBack,
  onAddComment,
  onUnsavedCommentChange,
  onPrint,
}: {
  row: Row;
  date: string;
  canAddReviewNote: boolean;
  onBack: () => void;
  onAddComment: (body: string) => Promise<boolean>;
  onUnsavedCommentChange: (dirty: boolean) => void;
  onPrint: () => void;
}) {
  const report = row.report;
  const activities = includedActivities(report);
  const activityReferences = useMemo(
    () =>
      Object.fromEntries(
        (report?.activities ?? []).map((activity) => [
          activity.id,
          {
            href: activity.sourceUrl,
            source: activity.source,
            title: activity.title,
          },
        ]),
      ),
    [report?.activities],
  );
  const comments = visibleReviewComments(report);
  const [commentBody, setCommentBody] = useState("");
  const [isAddingComment, setIsAddingComment] = useState(false);
  const currentStatus = reportStatus(row, date);
  const pdfActivities: ReportPdfActivity[] = activities.map((activity) => ({
    id: activity.id,
    title: activity.title,
    source: activity.source,
    sourceLabel: reportActivitySourceLabel(activity.source),
    duration: formatReportDuration(activity.durationMinutes),
    note: activity.employeeNote,
    status: activity.status,
  }));
  const pdfComments: ReportPdfComment[] = comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    meta: `${formatTimestamp(comment.createdAt)} by ${
      comment.author.name ?? comment.author.email ?? "Review team"
    }`,
  }));
  const revisions = report?.revisions ?? [];
  const latestRevision = revisions[0];

  async function handleCommentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canAddReviewNote || !report || !commentBody.trim()) {
      return;
    }

    setIsAddingComment(true);
    const added = await onAddComment(commentBody);
    setIsAddingComment(false);

    if (added) {
      setCommentBody("");
    }
  }

  useEffect(() => {
    onUnsavedCommentChange(Boolean(commentBody.trim()));

    return () => {
      onUnsavedCommentChange(false);
    };
  }, [commentBody, onUnsavedCommentChange]);

  useEffect(() => {
    if (!commentBody.trim()) {
      return;
    }

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [commentBody]);

  function handleBackClick() {
    if (
      commentBody.trim() &&
      !window.confirm("Discard this unsaved review note?")
    ) {
      return;
    }

    onBack();
  }

  return (
    <ReportPdfDocument
      eyebrow="Generis Daily Report"
      title="Daily Report"
      subtitle={
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{employeeLabel(row)}</span>
          <span aria-hidden="true">-</span>
          <span>{formatShortDate(report?.reportDate ?? date)}</span>
        </div>
      }
      status={
        currentStatus === "Submitted"
          ? undefined
          : {
              label: currentStatus,
              tone: reportPdfStatusTone(currentStatus),
            }
      }
      meta={[
        { label: "Department", value: userDepartmentLabel(row.user) },
        {
          label: "Location",
          value: report ? workLocationLabel(report.workLocation) : "-",
        },
        { label: "Submitted", value: formatTimestamp(report?.submittedAt) },
        { label: "Last updated", value: formatTimestamp(report?.updatedAt) },
      ]}
      summary={
        <SummaryRenderer
          value={report?.summary ?? ""}
          activityReferences={activityReferences}
          emptyText="No summary recorded."
        />
      }
      activities={pdfActivities}
      comments={pdfComments}
      backControl={
        <button
          className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]"
          onClick={handleBackClick}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to review dashboard
        </button>
      }
      actions={
        <Button
          className="h-10 rounded-[8px] bg-[#2563eb] px-5 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
          onClick={onPrint}
          disabled={!report}
        >
          <Download className="mr-2 h-4 w-4" />
          Download PDF
        </Button>
      }
      screenExtras={
        canAddReviewNote ? (
          <form onSubmit={handleCommentSubmit}>
            <label
              htmlFor="review-comment-body"
              className="mb-1.5 block text-sm font-semibold text-[#111827] dark:text-foreground"
            >
              Add review note
            </label>
            <Textarea
              id="review-comment-body"
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder="Add a note for the employee..."
              disabled={!report || isAddingComment}
              className="min-h-24 resize-y"
            />
            <div className="mt-3 flex justify-end">
              <Button
                type="submit"
                disabled={!report || !commentBody.trim() || isAddingComment}
              >
                {isAddingComment ? "Adding..." : "Add comment"}
              </Button>
            </div>
          </form>
        ) : null
      }
      footer={
        latestRevision ? (
          <>
            {revisions.length} revision{revisions.length === 1 ? "" : "s"}. Last
            edited {formatTimestamp(latestRevision.createdAt)} by{" "}
            {latestRevision.editedBy.name ??
              latestRevision.editedBy.email ??
              "User"}
            .
          </>
        ) : null
      }
    />
  );
}
