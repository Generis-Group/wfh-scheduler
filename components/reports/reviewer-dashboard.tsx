"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  Download,
  Edit3,
  FileText,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";

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
  ReportPageHeader,
  ReportSearchField,
  ReportStatusBadge,
  ReportSurface,
} from "@/components/reports/report-ui";
import { SummaryRenderer } from "@/components/reports/summary-renderer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FixedToast } from "@/components/ui/fixed-toast";
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
import { cn, initials, titleCase } from "@/lib/utils";

type DashboardUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
  status?: string | null;
  departments?: Array<{
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
  employee: DashboardUser;
  weekStart: string | Date;
  weekEnd: string | Date;
  reports: DashboardReport[];
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
      ?.map((membership) => membership.department?.name)
      .filter(Boolean) ?? [];
  return departments.length ? departments.join(", ") : "No department";
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
  return row.report ? titleCase(row.report.workLocation) : "";
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

export function ReviewerDashboard({
  rows,
  metrics: _metrics,
  date,
  reviewerId,
}: {
  rows: Row[];
  metrics: Metrics;
  date: string;
  reviewerId?: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState(rows);
  const [activeReportUserId, setActiveReportUserId] = useState<string | null>(
    null,
  );
  const [weeklyReportState, setWeeklyReportState] =
    useState<WeeklyReportState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [remindingUserId, setRemindingUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<EmployeeStatusFilter>("ALL");
  const [sortState, setSortState] = useState<EmployeeSortState>(
    defaultEmployeeSortState,
  );
  const [hasLoadedTableControls, setHasLoadedTableControls] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [blockedOpenUserId, setBlockedOpenUserId] = useState<string | null>(
    null,
  );
  const [pendingDateControl, setPendingDateControl] =
    useState<ReportDateControl | null>(null);
  const pendingDateRef = useRef<string | null>(null);
  const blockedOpenTimerRef = useRef<number | null>(null);
  const maxReportDate = todayDateString();
  const currentReviewDate = dateInputValue(date);
  const dateNavigationPending = pendingDateControl !== null;

  const departmentOptions = useMemo(() => {
    return [
      ...new Set(
        items
          .filter((row) => row.user.role === "EMPLOYEE")
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
          row.user.role === "EMPLOYEE" &&
          matchesSearch &&
          matchesDepartment &&
          matchesStatus
        );
      })
      .sort((first, second) =>
        compareEmployeeRows(first, second, date, sortState),
      );
  }, [date, departmentFilter, items, search, sortState, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filteredItems.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const visibleReportIds = pageItems.flatMap((row) =>
    canReviewReport(row) && row.report ? [row.report.id] : [],
  );
  const selectedRows = items.filter(
    (row) =>
      canReviewReport(row) &&
      row.report &&
      selectedReportIds.includes(row.report.id),
  );
  const allVisibleReportsSelected =
    visibleReportIds.length > 0 &&
    visibleReportIds.every((id) => selectedReportIds.includes(id));
  const activeRow = activeReportUserId
    ? (items.find((row) => row.user.id === activeReportUserId) ?? null)
    : null;
  const total = filteredItems.length;
  const submitted = filteredItems.filter(
    (row) => row.report?.status === "SUBMITTED",
  ).length;
  const unread = filteredItems.filter(
    (row) =>
      canReviewReport(row) && isUnreadForReviewer(row.report, reviewerId),
  ).length;
  const lateEdits = filteredItems.filter(
    (row) =>
      canReviewReport(row) &&
      (editedAfterDate(row.report, date) || isLate(row.report, date)),
  ).length;
  const coverage = total ? Math.round((submitted / total) * 100) : 0;
  const hasActiveTableControls =
    search.trim().length > 0 ||
    departmentFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    sortState.key !== defaultEmployeeSortState.key ||
    sortState.direction !== defaultEmployeeSortState.direction;

  useEffect(() => {
    setItems(rows);
    setActiveReportUserId(null);
    setWeeklyReportState(null);
    setSelectedReportIds([]);
    setBlockedOpenUserId(null);
    setRemindingUserId(null);
    setPage(1);
    pendingDateRef.current = null;
    setPendingDateControl(null);
  }, [date, rows]);

  useEffect(() => {
    return () => {
      if (blockedOpenTimerRef.current) {
        window.clearTimeout(blockedOpenTimerRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    setPage(1);
  }, [departmentFilter, search, sortState, statusFilter]);

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
    router.push(`/review?date=${targetDate}`);
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
          ? titleCase(row.report.workLocation)
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
    setPage(1);
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
    setPage(1);
  }

  function openReport(row: Row) {
    if (!canReviewReport(row)) {
      return;
    }

    void setReadState(row, true);
    setActiveReportUserId(row.user.id);
  }

  async function openWeeklyReport(row: Row) {
    setNotice(null);
    setActiveReportUserId(null);
    setWeeklyReportState({ status: "loading", employee: row.user });

    const response = await fetch(
      `/api/review/weekly-report?userId=${encodeURIComponent(
        row.user.id,
      )}&date=${encodeURIComponent(currentReviewDate)}`,
    );
    const body = await response.json().catch(() => ({}));

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

    setWeeklyReportState({ status: "ready", data: body.weeklyReport });
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

  async function markSelectedUnread() {
    const rowsToUpdate = selectedRows;

    setSelectedReportIds([]);
    await Promise.all(rowsToUpdate.map((row) => setReadState(row, false)));
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
        : `Email digest sent to ${recipients} reviewer/admin recipient${recipients === 1 ? "" : "s"}.`,
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
        setNotice(
          body.emailDelivery.reason ?? "Reminder email was skipped.",
        );
        return;
      }

      setNotice(body.emailDelivery?.error ?? "Reminder email failed.");
    } finally {
      setRemindingUserId(null);
    }
  }

  async function setReadState(row: Row, read: boolean) {
    if (!row.report) {
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
      {weeklyReportState ? (
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
          onBack={() => setActiveReportUserId(null)}
          onAddComment={(body) => addComment(activeRow, body)}
          onPrint={() => {
            window.print();
            setNotice(
              "Use the browser print dialog to save this report as PDF.",
            );
          }}
        />
      ) : (
        <main className="reference-page">
          <ReportPageHeader
            title="Review Dashboard"
            description="Track report coverage and submissions across the team."
          />

          <ReportSurface className="mb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ReportDateSwitcher
                value={currentReviewDate}
                maxDate={maxReportDate}
                pendingControl={pendingDateControl}
                disabled={dateNavigationPending}
                onChange={goToDate}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  className="h-10 min-w-[118px] shrink-0 justify-center rounded-[8px] bg-white px-3 text-xs shadow-none ring-1 ring-[#dfe4ee] dark:bg-[#0b1523] dark:ring-[#263a55]"
                  onClick={sendEmailDigest}
                  disabled={isSendingDigest}
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
          </ReportSurface>

          <ReportSurface className="mb-3">
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-[240px] flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h2 className="text-sm font-semibold text-[#101828] dark:text-foreground">
                    Coverage
                  </h2>
                  <span className="text-xs font-medium text-[#667085] dark:text-muted-foreground">
                    {submitted}/{total} submitted
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="w-14 text-[26px] font-semibold leading-none text-[#2563eb]">
                    {coverage}%
                  </span>
                  <div className="h-2 flex-1 rounded-full bg-[#e9edf5] dark:bg-[#263a55]">
                    <div
                      className="h-2 rounded-full bg-[#2563eb]"
                      style={{ width: `${coverage}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <CompactMetric label="Unread" value={unread} tone="blue" />
                <CompactMetric label="Late" value={lateEdits} tone="purple" />
              </div>
            </div>
          </ReportSurface>

          <ReportSurface padded={false}>
            <div className="grid gap-3 p-3 min-[1180px]:grid-cols-[minmax(360px,0.9fr)_minmax(0,1fr)] min-[1180px]:items-center">
              <div className="flex min-w-0 items-center gap-3">
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
                        onClick={markSelectedUnread}
                      >
                        Mark as unread
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex w-full flex-wrap items-center gap-2 min-[760px]:w-auto min-[1180px]:justify-end">
                <ReportSearchField
                  value={search}
                  onValueChange={(value) => {
                    setSearch(value);
                    setPage(1);
                  }}
                  className="flex-1 min-[560px]:w-[260px] min-[560px]:flex-none"
                  placeholder="Search employees"
                  aria-label="Search employees"
                />

                <Select
                  value={departmentFilter}
                  onChange={(event) => setDepartmentFilter(event.target.value)}
                  className="h-10 w-full min-[560px]:w-[240px]"
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
                  className="grid h-9 w-full grid-cols-3 rounded-[7px] bg-white p-0.5 ring-1 ring-[#dfe4ee] min-[560px]:w-auto dark:bg-[#0b1523] dark:ring-[#263a55]"
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
                    className="h-9 rounded-[7px] px-2 text-xs font-semibold text-[#64748b] transition-colors hover:bg-[#f1f5f9] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground"
                    onClick={clearTableControls}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
            <div className="overflow-x-auto px-3">
              <table className="w-full min-w-[1080px] text-xs">
                <thead>
                  <tr className="border-b border-[#e5eaf2] text-left text-[10px] font-semibold uppercase tracking-[0.02em] text-[#64748b] dark:border-[#263a55] dark:text-muted-foreground">
                    <th className="w-[36px] px-2 py-2">
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
                      className="w-[22%] px-2 py-2"
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
                      className="w-[14%] px-2 py-2"
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
                      className="w-[10%] px-2 py-2"
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
                      className="w-[18%] px-2 py-2"
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
                      className="w-[10%] px-2 py-2"
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
                      className="w-[14%] px-2 py-2"
                      aria-sort={sortAriaValue(sortState, "submitted")}
                    >
                      <SortableHeader
                        label="Submitted"
                        sortKey="submitted"
                        sortState={sortState}
                        onSort={toggleEmployeeSort}
                      />
                    </th>
                    <th className="w-[14%] px-2 py-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8">
                        <EmptyReferenceState>
                          No employee reports match this search.
                        </EmptyReferenceState>
                      </td>
                    </tr>
                  ) : (
                    pageItems.map((row) => {
                      const status = reportStatus(row, date);
                      const canReview = canReviewReport(row);
                      const blockedReason =
                        row.report?.status === "DRAFT"
                          ? "Drafts are private until submitted"
                          : "No report has been submitted yet";
                      const unavailablePulse =
                        blockedOpenUserId === row.user.id;
                      const reminderPending = remindingUserId === row.user.id;
                      const flags = canReview ? dashboardFlags(row, date) : [];
                      const unread =
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
                            "border-b border-[#e5eaf2] text-[#344054] transition-colors last:border-b-0 hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563eb] dark:border-[#263a55] dark:text-muted-foreground dark:hover:bg-white/[0.04]",
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
                          <td className="px-2 py-2.5">
                            {canReview && row.report ? (
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
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-3">
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-full",
                                  unread ? "bg-[#2563eb]" : "bg-transparent",
                                )}
                              />
                              <Avatar name={row.user.name ?? row.user.email} />
                              <span className="truncate text-xs font-semibold text-[#101828] dark:text-foreground">
                                {row.user.name ?? row.user.email ?? "Employee"}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-xs text-[#475467] dark:text-muted-foreground">
                            {userDepartmentLabel(row.user)}
                          </td>
                          <td className="px-2 py-2.5">
                            <ReportStatusBadge
                              status={status}
                              className="px-2.5 py-1 text-[11px] font-semibold"
                            />
                          </td>
                          <td className="px-2 py-2.5">
                            <div className="flex min-w-[120px] flex-wrap items-center gap-1.5">
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
                          <td className="px-2 py-2.5 text-xs">
                            {canReview && row.report
                              ? titleCase(row.report.workLocation)
                              : "-"}
                          </td>
                          <td className="px-2 py-2.5 text-xs">
                            {formatTimestamp(row.report?.submittedAt)}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {canReview ? (
                                <Button
                                  variant="outline"
                                  className="h-8 rounded-[7px] px-3 text-xs text-[#2563eb]"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openReport(row);
                                  }}
                                  onKeyDown={(event) => event.stopPropagation()}
                                >
                                  Review
                                </Button>
                              ) : (
                                <>
                                  <span
                                    className={cn(
                                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-[#64748b] opacity-0 transition-opacity dark:text-muted-foreground",
                                      unavailablePulse &&
                                        "reference-lock-nudge bg-[#eef2f7] opacity-100 dark:bg-white/10",
                                    )}
                                    aria-hidden="true"
                                  >
                                    <Lock className="h-3.5 w-3.5" />
                                  </span>
                                  <Button
                                    variant="outline"
                                    className="h-8 rounded-[7px] px-2.5 text-xs text-[#2563eb]"
                                    title={blockedReason}
                                    disabled={remindingUserId !== null}
                                    aria-label={`Send reminder to ${employeeLabel(row)}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void sendReportReminder(row);
                                    }}
                                    onKeyDown={(event) => event.stopPropagation()}
                                  >
                                    {reminderPending ? (
                                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Mail className="mr-1.5 h-3.5 w-3.5" />
                                    )}
                                    {reminderPending ? "Sending" : "Remind"}
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="outline"
                                className="h-8 rounded-[7px] px-2.5 text-xs text-[#2563eb]"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void openWeeklyReport(row);
                                }}
                                onKeyDown={(event) => event.stopPropagation()}
                              >
                                <CalendarRange className="mr-1.5 h-3.5 w-3.5" />
                                Week
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
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-[#475467] dark:text-muted-foreground">
              <div className="flex items-center gap-3">
                <span>Rows per page</span>
                <Select
                  value={String(pageSize)}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="h-10 w-28"
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                </Select>
              </div>
              <div className="flex items-center gap-8">
                <span>
                  {filteredItems.length === 0
                    ? 0
                    : (currentPage - 1) * pageSize + 1}
                  -{Math.min(currentPage * pageSize, filteredItems.length)} of{" "}
                  {filteredItems.length}
                </span>
                <div className="flex items-center gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-[7px] bg-white text-[#64748b] ring-1 ring-[#dfe4ee] hover:text-[#2563eb] dark:bg-[#0b1523] dark:ring-[#263a55]"
                    aria-label="First page"
                    onClick={() => setPage(1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-[7px] bg-white text-[#64748b] ring-1 ring-[#dfe4ee] hover:text-[#2563eb] dark:bg-[#0b1523] dark:ring-[#263a55]"
                    aria-label="Previous page"
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="flex h-9 w-9 items-center justify-center rounded-[7px] border border-[#93c5fd] text-[#2563eb]">
                    {currentPage}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-[7px] bg-white text-[#64748b] ring-1 ring-[#dfe4ee] hover:text-[#2563eb] dark:bg-[#0b1523] dark:ring-[#263a55]"
                    aria-label="Next page"
                    onClick={() =>
                      setPage((value) => Math.min(pageCount, value + 1))
                    }
                    disabled={currentPage === pageCount}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-[7px] bg-white text-[#64748b] ring-1 ring-[#dfe4ee] hover:text-[#2563eb] dark:bg-[#0b1523] dark:ring-[#263a55]"
                    aria-label="Last page"
                    onClick={() => setPage(pageCount)}
                    disabled={currentPage === pageCount}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </ReportSurface>
        </main>
      )}
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

function WeeklyReportReviewPage({
  state,
  onBack,
  onPrint,
}: {
  state: WeeklyReportState;
  onBack: () => void;
  onPrint: () => void;
}) {
  if (state.status !== "ready") {
    return (
      <main className="reference-page">
        <button
          className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to review dashboard
        </button>
        <ReportSurface className="flex min-h-[260px] items-center justify-center">
          <div className="text-center">
            {state.status === "loading" ? (
              <>
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#2563eb]" />
                <h1 className="mt-4 text-lg font-semibold text-[#101828] dark:text-foreground">
                  Generating weekly report
                </h1>
                <p className="mt-1 text-sm text-[#667085] dark:text-muted-foreground">
                  {userLabel(state.employee)}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-lg font-semibold text-[#101828] dark:text-foreground">
                  Unable to generate weekly report
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
  const reports = [...data.reports].sort(
    (first, second) =>
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
  const submittedCount = reports.length;
  const expectedDays = weekDates.length;
  const weeklyActivities: ReportPdfActivity[] = reports.flatMap((report) =>
    includedActivities(report).map((activity) => ({
      id: `${report.id}:${activity.id}`,
      title: activity.title,
      source: activity.source,
      sourceLabel: `${formatWeekdayShortDate(
        report.reportDate,
      )} - ${reportActivitySourceLabel(activity.source)}`,
      duration: formatReportDuration(activity.durationMinutes),
      note: activity.employeeNote || activity.status || "-",
      status: activity.status,
    })),
  );
  const weeklyComments: ReportPdfComment[] = reports.flatMap((report) =>
    visibleReviewComments(report).map((comment) => ({
      id: `${report.id}:${comment.id}`,
      body: comment.body,
      meta: `${formatShortDate(report.reportDate)} - ${formatTimestamp(
        comment.createdAt,
      )} by ${comment.author.name ?? comment.author.email ?? "Review team"}`,
    })),
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
    <ReportPdfDocument
      eyebrow="Generis Weekly Report"
      title="Weekly Report"
      subtitle={
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{userLabel(data.employee)}</span>
          <span aria-hidden="true">-</span>
          <span>{formatWeekRange(data.weekStart, data.weekEnd)}</span>
        </div>
      }
      status={{
        label: `${submittedCount}/${expectedDays} submitted`,
        tone:
          submittedCount === expectedDays
            ? "green"
            : submittedCount > 0
              ? "orange"
              : "red",
      }}
      meta={[
        { label: "Department", value: userDepartmentLabel(data.employee) },
        { label: "Week", value: formatWeekRange(data.weekStart, data.weekEnd) },
        {
          label: "Submitted days",
          value: `${submittedCount}/${expectedDays}`,
        },
        { label: "Activities", value: weeklyActivities.length },
      ]}
      summary={
        <div className="space-y-3">
          {weekDates.map((weekDate) => {
            const report = reportsByDate.get(weekDate);

            return (
              <div
                key={weekDate}
                className="rounded-[8px] bg-[#f8fafc] p-3 ring-1 ring-[#e5eaf2] dark:bg-white/[0.04] dark:ring-[#263a55]"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[#111827] dark:text-foreground">
                    {formatWeekdayShortDate(weekDate)}
                  </h3>
                  <ReportStatusBadge
                    status={report ? "Submitted" : "Missing"}
                    className="px-2.5 py-1 text-[11px] font-semibold"
                  />
                </div>
                {report ? (
                  <SummaryRenderer
                    value={report.summary}
                    activityReferences={activityReferences}
                    emptyText="No summary recorded."
                  />
                ) : (
                  <p className="text-sm text-[#667085] dark:text-muted-foreground">
                    No submitted report.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      }
      activities={weeklyActivities}
      comments={weeklyComments}
      backControl={
        <button
          className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to review dashboard
        </button>
      }
      actions={
        <Button
          className="h-10 rounded-[8px] bg-[#2563eb] px-5 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
          onClick={onPrint}
        >
          <Download className="mr-2 h-4 w-4" />
          Download PDF
        </Button>
      }
      footer={
        <>
          Generated from submitted daily reports for{" "}
          {formatWeekRange(data.weekStart, data.weekEnd)}.
        </>
      }
    />
  );
}

function ReportReviewPage({
  row,
  date,
  onBack,
  onAddComment,
  onPrint,
}: {
  row: Row;
  date: string;
  onBack: () => void;
  onAddComment: (body: string) => Promise<boolean>;
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
          value: report ? titleCase(report.workLocation) : "-",
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
          onClick={onBack}
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
        <form onSubmit={handleCommentSubmit}>
          <Textarea
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
            placeholder="Add a note for the employee..."
            disabled={!report || isAddingComment}
            className="min-h-24"
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
      }
      footer={
        latestRevision ? (
          <>
            {revisions.length} revision{revisions.length === 1 ? "" : "s"}.
            Last edited {formatTimestamp(latestRevision.createdAt)} by{" "}
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
