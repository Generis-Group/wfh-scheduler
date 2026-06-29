"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Search,
} from "lucide-react";

import { useDismissableLayer } from "@/components/ui/use-dismissable-layer";
import { Select } from "@/components/ui/select";
import { anchoredFixedPlacement } from "@/lib/anchored-position";
import { markServerDataStale } from "@/lib/client-cache-invalidation";
import { responseErrorMessage } from "@/lib/client-requests";
import { addReportDateDays, todayDateString } from "@/lib/dates";
import {
  plannedWorkLocationValues,
  workLocationLabel,
  type PlannedWorkLocationValue,
  type WorkLocationValue,
} from "@/lib/work-locations";
import { cn } from "@/lib/utils";

type CalendarDepartment = {
  id: string;
  name: string;
  slug: string;
};

type CalendarUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  departments?: Array<{
    role?: string | null;
    department?: { name?: string | null } | null;
  }>;
};

type CalendarDay = {
  date: string;
  source: "REPORT" | "PLAN" | "NONE";
  workLocation: WorkLocationValue | null;
  reportId: string | null;
};

type CalendarRow = {
  user: CalendarUser;
  days: CalendarDay[];
};

type CalendarMonthDay = {
  date: string;
  inCurrentMonth: boolean;
};

type PlannedWorkLocation = {
  id?: string;
  userId?: string;
  date: string;
  workLocation: PlannedWorkLocationValue;
};

export type WorkLocationCalendarData = {
  viewerUserId: string;
  canPlanOwnWeek: boolean;
  weekStart: string;
  weekEnd: string;
  dates: string[];
  departments: CalendarDepartment[];
  selectedDepartmentId: string | null;
  myPlans: PlannedWorkLocation[];
  rows: CalendarRow[];
  month: {
    monthStart: string;
    monthEnd: string;
    dates: CalendarMonthDay[];
    rows: CalendarRow[];
  };
};

type CalendarView = "weekly-list" | "wfh-calendar";

type WfhCoverage = "full" | "am" | "pm";

type WfhCalendarEntry = {
  id: string;
  date: string;
  name: string;
  shortName: string;
  coverage: WfhCoverage;
  source: CalendarDay["source"];
};

type WfhOverflowMenu = {
  date: string;
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

type FloatingPanelPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

const planLocationOptions = plannedWorkLocationValues.map((value) => ({
  value,
  label: workLocationLabel(value),
}));

const weekNavButtonClassName =
  "inline-flex h-9 items-center gap-2 rounded-[8px] bg-white px-3 text-sm font-semibold text-[#344054] ring-1 ring-[#dfe5ef] transition-colors hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:bg-white/[0.04] dark:text-foreground dark:ring-[#263a55] dark:hover:bg-white/[0.08]";

const calendarViewButtonClassName =
  "inline-flex h-8 min-w-0 items-center justify-center rounded-[7px] px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]";

function displayName(user: CalendarUser) {
  return user.name || user.email || "Employee";
}

function shortPersonName(user: CalendarUser) {
  const name = displayName(user).trim();
  const [firstName] = name.split(/\s+/);

  return firstName || name;
}

function employeeDepartmentLabel(user: CalendarUser) {
  const departments =
    user.departments
      ?.filter((membership) => membership.role === "EMPLOYEE")
      .map((membership) => membership.department?.name)
      .filter(Boolean) ?? [];

  return departments.length ? departments.join(", ") : "No department";
}

function rowSearchText(row: { user: CalendarUser }) {
  return [
    displayName(row.user),
    row.user.email,
    employeeDepartmentLabel(row.user),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function utcDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function localDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(utcDate(value));
}

function dayNumber(value: string) {
  return utcDate(value).getUTCDate();
}

function weekdayLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(utcDate(value));
}

function isWeekdayDate(value: string) {
  const weekday = utcDate(value).getUTCDay();

  return weekday >= 1 && weekday <= 5;
}

function weekRangeLabel(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return `${formatter.format(utcDate(start))} - ${formatter.format(utcDate(end))}`;
}

function shortWeekLabel(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return `${formatter.format(utcDate(start))} - ${formatter.format(utcDate(end))}`;
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcDate(value));
}

function twoDigit(value: number) {
  return String(value).padStart(2, "0");
}

function dateStringFromParts(year: number, monthIndex: number, day: number) {
  return `${year}-${twoDigit(monthIndex + 1)}-${twoDigit(day)}`;
}

function monthKeyFromDate(value: string) {
  return value.slice(0, 7);
}

function monthDateFromKey(monthKey: string) {
  return new Date(`${monthKey}-01T12:00:00`);
}

function addCalendarMonths(monthKey: string, offset: number) {
  const monthDate = monthDateFromKey(monthKey);
  const nextMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + offset,
    1,
    12,
  );

  return dateStringFromParts(
    nextMonth.getFullYear(),
    nextMonth.getMonth(),
    1,
  ).slice(0, 7);
}

function calendarDaysForMonth(monthKey: string) {
  const monthDate = monthDateFromKey(monthKey);
  const year = monthDate.getFullYear();
  const monthIndex = monthDate.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1, 12).getDay();
  const gridStart = new Date(year, monthIndex, 1 - firstWeekday, 12);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);

    return {
      value: dateStringFromParts(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      ),
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === monthIndex,
    };
  });
}

function formatCalendarDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(localDate(value));
}

function formatMonthLabel(monthKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(monthDateFromKey(monthKey));
}

function selectedMonthDate(monthStart: string, offset = 0) {
  return `${addCalendarMonths(monthKeyFromDate(monthStart), offset)}-01`;
}

function wfhCoverage(location: WorkLocationValue | null): WfhCoverage | null {
  if (location === "WFH") {
    return "full";
  }

  if (location === "WFH_AM_OFFICE_PM") {
    return "am";
  }

  if (location === "OFFICE_AM_WFH_PM") {
    return "pm";
  }

  return null;
}

function wfhCoverageLabel(coverage: WfhCoverage) {
  if (coverage === "am") {
    return "AM WFH";
  }

  if (coverage === "pm") {
    return "PM WFH";
  }

  return "WFH";
}

function workWeeks(dates: CalendarMonthDay[]) {
  const weeks: CalendarMonthDay[][] = [];

  for (let index = 0; index < dates.length; index += 7) {
    weeks.push(
      dates.slice(index, index + 7).filter((day) => isWeekdayDate(day.date)),
    );
  }

  return weeks;
}

const defaultVisibleWfhEntries = 5;
const maxMeasuredVisibleWfhEntries = 5;
const wfhCalendarCellChromeHeight = 34;
const wfhCalendarEntrySlotHeight = 22;

function visibleWfhEntryLimitForHeight(cellHeight: number) {
  const measuredLimit = Math.floor(
    (cellHeight - wfhCalendarCellChromeHeight) / wfhCalendarEntrySlotHeight,
  );

  return Math.min(
    maxMeasuredVisibleWfhEntries,
    Math.max(1, measuredLimit || defaultVisibleWfhEntries),
  );
}

function useWfhCalendarVisibleEntryLimit(resetKey: string) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [visibleEntryLimit, setVisibleEntryLimit] = useState(
    defaultVisibleWfhEntries,
  );

  useEffect(() => {
    function updateVisibleEntryLimit() {
      const firstDayCell = gridRef.current?.querySelector<HTMLElement>(
        "[data-wfh-calendar-day]",
      );
      const cellHeight = firstDayCell?.getBoundingClientRect().height ?? 0;

      setVisibleEntryLimit(
        cellHeight
          ? visibleWfhEntryLimitForHeight(cellHeight)
          : defaultVisibleWfhEntries,
      );
    }

    updateVisibleEntryLimit();

    if (!gridRef.current || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(updateVisibleEntryLimit);
    observer.observe(gridRef.current);

    return () => observer.disconnect();
  }, [resetKey]);

  return { gridRef, visibleEntryLimit };
}

function wfhEntriesByDate(rows: CalendarRow[]) {
  const entriesByDate = new Map<string, WfhCalendarEntry[]>();

  for (const row of rows) {
    for (const day of row.days) {
      const coverage = wfhCoverage(day.workLocation);

      if (!coverage) {
        continue;
      }

      const entries = entriesByDate.get(day.date) ?? [];
      entries.push({
        id: `${day.date}:${row.user.id}:${coverage}`,
        date: day.date,
        name: displayName(row.user),
        shortName: shortPersonName(row.user),
        coverage,
        source: day.source,
      });
      entriesByDate.set(day.date, entries);
    }
  }

  for (const entries of entriesByDate.values()) {
    entries.sort((first, second) => first.name.localeCompare(second.name));
  }

  return entriesByDate;
}

function locationTone(location: WorkLocationValue | null) {
  if (location === "OFFICE") {
    return "bg-blue-500/10 text-blue-700 dark:text-blue-200";
  }

  if (location === "WFH") {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
  }

  if (location === "OFFICE_AM_WFH_PM" || location === "WFH_AM_OFFICE_PM") {
    return "bg-violet-500/10 text-violet-700 dark:text-violet-200";
  }

  if (location === "PTO" || location === "OUT_OF_OFFICE") {
    return "bg-slate-500/10 text-slate-700 dark:text-slate-200";
  }

  return "bg-transparent text-[#94a3b8] dark:text-[#64748b]";
}

function sourceLabel(source: CalendarDay["source"]) {
  if (source === "REPORT") {
    return "Submitted";
  }

  if (source === "PLAN") {
    return "Planned";
  }

  return "";
}

function calendarHref(
  date: string,
  departmentId?: string | null,
  view?: CalendarView,
) {
  const params = new URLSearchParams({ date });

  if (departmentId) {
    params.set("departmentId", departmentId);
  }

  if (view === "wfh-calendar") {
    params.set("view", view);
  }

  return `/calendar?${params.toString()}`;
}

function WeekPicker({
  weekStart,
  weekEnd,
  onSelectDate,
}: {
  weekStart: string;
  weekEnd: string;
  onSelectDate: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() =>
    monthKeyFromDate(weekStart),
  );
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const pickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const pickerMenuRef = useRef<HTMLDivElement | null>(null);
  const [pickerPosition, setPickerPosition] =
    useState<FloatingPanelPosition | null>(null);
  const calendarDays = calendarDaysForMonth(pickerMonth);

  const updatePickerPosition = useCallback(() => {
    if (typeof window === "undefined" || !pickerButtonRef.current) {
      return;
    }

    const placement = anchoredFixedPlacement({
      anchorRect: pickerButtonRef.current.getBoundingClientRect(),
      preferredWidth: 320,
      preferredMaxHeight: 360,
      minHeight: 220,
      flipHeight: 260,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      viewportPadding: 8,
      gap: 6,
      align: "end",
    });

    setPickerPosition({
      left: placement.left,
      top: placement.top,
      width: placement.width,
      maxHeight: placement.maxHeight,
    });
  }, []);

  useDismissableLayer({
    open,
    refs: [pickerRef, pickerMenuRef],
    onDismiss: () => setOpen(false),
  });

  useEffect(() => {
    setPickerMonth(monthKeyFromDate(weekStart));
  }, [weekStart]);

  useEffect(() => {
    if (!open) {
      setPickerPosition(null);
      return undefined;
    }

    updatePickerPosition();
    window.addEventListener("resize", updatePickerPosition);
    window.addEventListener("scroll", updatePickerPosition, true);

    return () => {
      window.removeEventListener("resize", updatePickerPosition);
      window.removeEventListener("scroll", updatePickerPosition, true);
    };
  }, [open, updatePickerPosition]);

  function selectDate(date: string) {
    setOpen(false);
    onSelectDate(date);
  }

  return (
    <div ref={pickerRef} className="relative">
      <button
        ref={pickerButtonRef}
        type="button"
        aria-label="Jump to week"
        aria-expanded={open}
        aria-controls="work-location-week-picker"
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-[8px] bg-white px-3 text-sm font-semibold text-[#111827] shadow-none ring-1 ring-[#dfe4ee] transition-colors hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:bg-[#101d2e] dark:text-foreground dark:ring-[#263a55] dark:hover:bg-white/5"
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }

          updatePickerPosition();
          setOpen(true);
        }}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-[#667085] dark:text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">
          {shortWeekLabel(weekStart, weekEnd)}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[#667085] transition-transform dark:text-muted-foreground",
            open && "rotate-180",
          )}
        />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={pickerMenuRef}
              id="work-location-week-picker"
              className="fixed z-[1000] overflow-y-auto overscroll-contain rounded-[8px] bg-white p-2 shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-[#dfe4ee] [scrollbar-gutter:stable] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
              style={{
                left: pickerPosition?.left ?? 0,
                top: pickerPosition?.top ?? 0,
                width: pickerPosition?.width,
                maxHeight: pickerPosition?.maxHeight,
                visibility: pickerPosition ? "visible" : "hidden",
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="reference-menu-button"
                  aria-label="Previous month"
                  onClick={() =>
                    setPickerMonth((month) => addCalendarMonths(month, -1))
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-sm font-semibold text-[#111827] dark:text-foreground">
                  {formatMonthLabel(pickerMonth)}
                </div>
                <button
                  type="button"
                  className="reference-menu-button"
                  aria-label="Next month"
                  onClick={() =>
                    setPickerMonth((month) => addCalendarMonths(month, 1))
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 px-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-[#667085] dark:text-muted-foreground">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (weekday) => (
                    <span key={weekday}>{weekday}</span>
                  ),
                )}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((calendarDay) => {
                  const inSelectedWeek =
                    calendarDay.value >= weekStart &&
                    calendarDay.value <= weekEnd;
                  const isWeekStart = calendarDay.value === weekStart;

                  return (
                    <button
                      key={calendarDay.value}
                      type="button"
                      className={cn(
                        "flex h-9 items-center justify-center rounded-[7px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]",
                        calendarDay.inCurrentMonth
                          ? "text-[#111827] hover:bg-[#eff6ff] dark:text-foreground dark:hover:bg-white/10"
                          : "text-[#98a2b3] hover:bg-[#f8fafc] dark:text-muted-foreground/70 dark:hover:bg-white/5",
                        inSelectedWeek &&
                          "bg-[#eff6ff] text-[#1d4ed8] dark:bg-blue-400/10 dark:text-blue-100",
                        isWeekStart &&
                          "bg-[#2563eb] text-white hover:bg-[#1d4ed8] dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400",
                      )}
                      aria-label={`Select ${formatCalendarDate(
                        calendarDay.value,
                      )}`}
                      aria-current={isWeekStart ? "date" : undefined}
                      onClick={() => selectDate(calendarDay.value)}
                    >
                      {calendarDay.day}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function MonthPicker({
  monthStart,
  onSelectDate,
}: {
  monthStart: string;
  onSelectDate: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() =>
    monthDateFromKey(monthKeyFromDate(monthStart)).getFullYear(),
  );
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const pickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const pickerMenuRef = useRef<HTMLDivElement | null>(null);
  const [pickerPosition, setPickerPosition] =
    useState<FloatingPanelPosition | null>(null);
  const selectedMonthKey = monthKeyFromDate(monthStart);
  const selectedYear = monthDateFromKey(selectedMonthKey).getFullYear();
  const monthButtons = useMemo(
    () =>
      Array.from({ length: 12 }, (_, monthIndex) => {
        const date = dateStringFromParts(pickerYear, monthIndex, 1);

        return {
          date,
          key: date.slice(0, 7),
          label: new Intl.DateTimeFormat("en-US", {
            month: "short",
          }).format(localDate(date)),
          fullLabel: monthLabel(date),
        };
      }),
    [pickerYear],
  );

  const updatePickerPosition = useCallback(() => {
    if (typeof window === "undefined" || !pickerButtonRef.current) {
      return;
    }

    const placement = anchoredFixedPlacement({
      anchorRect: pickerButtonRef.current.getBoundingClientRect(),
      preferredWidth: 304,
      preferredMaxHeight: 340,
      minHeight: 220,
      flipHeight: 240,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      viewportPadding: 8,
      gap: 6,
      align: "end",
    });

    setPickerPosition({
      left: placement.left,
      top: placement.top,
      width: placement.width,
      maxHeight: placement.maxHeight,
    });
  }, []);

  useDismissableLayer({
    open,
    refs: [pickerRef, pickerMenuRef],
    onDismiss: () => setOpen(false),
  });

  useEffect(() => {
    if (open) {
      setPickerYear(selectedYear);
    }
  }, [open, selectedYear]);

  useEffect(() => {
    if (!open) {
      setPickerPosition(null);
      return undefined;
    }

    updatePickerPosition();
    window.addEventListener("resize", updatePickerPosition);
    window.addEventListener("scroll", updatePickerPosition, true);

    return () => {
      window.removeEventListener("resize", updatePickerPosition);
      window.removeEventListener("scroll", updatePickerPosition, true);
    };
  }, [open, updatePickerPosition]);

  function selectMonth(date: string) {
    setOpen(false);
    onSelectDate(date);
  }

  return (
    <div ref={pickerRef} className="relative">
      <button
        ref={pickerButtonRef}
        type="button"
        aria-label="Jump to month"
        aria-expanded={open}
        aria-controls="work-location-month-picker"
        className="flex h-10 w-full min-w-0 items-center gap-2 rounded-[8px] bg-white px-3 text-sm font-semibold text-[#111827] shadow-none ring-1 ring-[#dfe4ee] transition-colors hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:bg-[#101d2e] dark:text-foreground dark:ring-[#263a55] dark:hover:bg-white/5"
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }

          updatePickerPosition();
          setOpen(true);
        }}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-[#667085] dark:text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">
          {monthLabel(monthStart)}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[#667085] transition-transform dark:text-muted-foreground",
            open && "rotate-180",
          )}
        />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={pickerMenuRef}
              id="work-location-month-picker"
              className="fixed z-[1000] overflow-y-auto overscroll-contain rounded-[8px] bg-white p-2 shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-[#dfe4ee] [scrollbar-gutter:stable] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
              style={{
                left: pickerPosition?.left ?? 0,
                top: pickerPosition?.top ?? 0,
                width: pickerPosition?.width,
                maxHeight: pickerPosition?.maxHeight,
                visibility: pickerPosition ? "visible" : "hidden",
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="reference-menu-button"
                  aria-label="Previous year"
                  onClick={() => setPickerYear((year) => year - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-sm font-semibold text-[#111827] dark:text-foreground">
                  {pickerYear}
                </div>
                <button
                  type="button"
                  className="reference-menu-button"
                  aria-label="Next year"
                  onClick={() => setPickerYear((year) => year + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {monthButtons.map((month) => {
                  const selected = month.key === selectedMonthKey;

                  return (
                    <button
                      key={month.key}
                      type="button"
                      className={cn(
                        "flex h-10 items-center justify-center rounded-[7px] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]",
                        selected
                          ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8] dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400"
                          : "text-[#344054] hover:bg-[#eff6ff] hover:text-[#1d4ed8] dark:text-foreground dark:hover:bg-white/10 dark:hover:text-blue-100",
                      )}
                      aria-label={`Select ${month.fullLabel}`}
                      aria-current={selected ? "date" : undefined}
                      onClick={() => selectMonth(month.date)}
                    >
                      {month.label}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function LocationCell({ day }: { day: CalendarDay }) {
  if (!day.workLocation) {
    return (
      <span className="text-sm font-medium text-[#98a2b3] dark:text-muted-foreground/70">
        -
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full flex-col rounded-[7px] px-2.5 py-1 text-xs font-semibold",
        locationTone(day.workLocation),
      )}
    >
      <span className="truncate">{workLocationLabel(day.workLocation)}</span>
      {day.source !== "NONE" ? (
        <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-70">
          {day.source === "REPORT" ? <CheckCircle2 className="h-3 w-3" /> : null}
          {sourceLabel(day.source)}
        </span>
      ) : null}
    </span>
  );
}

function WfhNameBar({ entry }: { entry: WfhCalendarEntry }) {
  const label = `${entry.name} - ${wfhCoverageLabel(entry.coverage)}`;

  if (entry.coverage === "full") {
    return (
      <div
        className="flex h-5 min-w-0 items-center rounded-[6px] bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-900 ring-1 ring-emerald-500/20 dark:bg-emerald-400/16 dark:text-emerald-100 dark:ring-emerald-300/15"
        title={label}
      >
        <span className="min-w-0 truncate">{entry.shortName}</span>
      </div>
    );
  }

  return (
    <div
      className="relative h-5 min-w-0 rounded-[6px] bg-[#eef2f8] ring-1 ring-[#dfe4ee] dark:bg-white/[0.035] dark:ring-white/[0.055]"
      title={label}
    >
      <div
        className={cn(
          "absolute inset-y-0 flex min-w-0 items-center rounded-[6px] px-1.5 text-[10px] font-semibold ring-1",
          entry.coverage === "am"
            ? "left-0 w-1/2 bg-cyan-500/15 text-cyan-900 ring-cyan-500/20 dark:bg-cyan-400/16 dark:text-cyan-100 dark:ring-cyan-300/15"
            : "right-0 w-1/2 bg-blue-500/15 text-blue-900 ring-blue-500/20 dark:bg-blue-400/16 dark:text-blue-100 dark:ring-blue-300/15",
        )}
      >
        <span className="min-w-0 truncate">{entry.shortName}</span>
      </div>
    </div>
  );
}

function WfhCalendarGrid({
  dates,
  entriesByDate,
}: {
  dates: CalendarMonthDay[];
  entriesByDate: Map<string, WfhCalendarEntry[]>;
}) {
  const [openOverflowMenu, setOpenOverflowMenu] =
    useState<WfhOverflowMenu | null>(null);
  const overflowTriggerRef = useRef<HTMLDivElement | null>(null);
  const overflowMenuRef = useRef<HTMLDivElement | null>(null);
  const weeks = useMemo(() => workWeeks(dates), [dates]);
  const datesKey = useMemo(
    () => dates.map((calendarDay) => calendarDay.date).join("|"),
    [dates],
  );
  const { gridRef, visibleEntryLimit } =
    useWfhCalendarVisibleEntryLimit(datesKey);
  const openOverflowEntries = openOverflowMenu
    ? (entriesByDate.get(openOverflowMenu.date) ?? [])
    : [];
  const openOverflowDateLabel = openOverflowMenu
    ? formatCalendarDate(openOverflowMenu.date)
    : "";

  const overflowPlacement = useCallback((anchorRect: DOMRect) => {
    return anchoredFixedPlacement({
      anchorRect,
      preferredWidth: 256,
      preferredMaxHeight: 256,
      minHeight: 80,
      flipHeight: 160,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      placement: "top",
    });
  }, []);

  const updateOpenOverflowMenuPosition = useCallback(() => {
    if (!openOverflowMenu || !overflowTriggerRef.current) {
      return;
    }

    const placement = overflowPlacement(
      overflowTriggerRef.current.getBoundingClientRect(),
    );

    setOpenOverflowMenu((current) =>
      current
        ? {
            ...current,
            left: placement.left,
            top: placement.top,
            width: placement.width,
            maxHeight: placement.maxHeight,
          }
        : current,
    );
  }, [openOverflowMenu, overflowPlacement]);

  useDismissableLayer({
    open: Boolean(openOverflowMenu),
    refs: [overflowTriggerRef, overflowMenuRef],
    onDismiss: () => setOpenOverflowMenu(null),
  });

  useEffect(() => {
    if (!openOverflowMenu) {
      return undefined;
    }

    window.addEventListener("resize", updateOpenOverflowMenuPosition);
    window.addEventListener("scroll", updateOpenOverflowMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateOpenOverflowMenuPosition);
      window.removeEventListener("scroll", updateOpenOverflowMenuPosition, true);
    };
  }, [openOverflowMenu, updateOpenOverflowMenuPosition]);

  function toggleOverflowMenu(
    date: string,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    if (openOverflowMenu?.date === date) {
      setOpenOverflowMenu(null);
      return;
    }

    const placement = overflowPlacement(
      event.currentTarget.getBoundingClientRect(),
    );

    setOpenOverflowMenu({
      date,
      left: placement.left,
      top: placement.top,
      width: placement.width,
      maxHeight: placement.maxHeight,
    });
  }

  return (
    <div className="reference-table-scroll wfh-calendar-scroll">
      <div className="wfh-calendar-grid-frame">
        <div
          ref={gridRef}
          className="wfh-calendar-grid gap-px rounded-[8px] bg-[#dfe4ee] p-px dark:bg-[#263a55]"
        >
          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((weekday) => (
            <div
              key={weekday}
              className="bg-[#f8fafc] px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#667085] first:rounded-tl-[7px] last:rounded-tr-[7px] dark:bg-white/[0.035] dark:text-muted-foreground"
            >
              {weekday}
            </div>
          ))}
          {weeks.flatMap((week, weekIndex) =>
            week.map((calendarDay, dayIndex) => {
              const entries = entriesByDate.get(calendarDay.date) ?? [];
              const visibleEntries = entries.slice(0, visibleEntryLimit);
              const hiddenEntries = entries.slice(visibleEntries.length);
              const isOpen = openOverflowMenu?.date === calendarDay.date;
              const dateLabel = formatCalendarDate(calendarDay.date);

              return (
                <div
                  key={calendarDay.date}
                  data-wfh-calendar-day
                  className={cn(
                    "relative min-w-0 bg-white p-2 dark:bg-[#0f1b2a]",
                    !calendarDay.inCurrentMonth &&
                      "bg-[#f8fafc] text-[#98a2b3] dark:bg-white/[0.018] dark:text-muted-foreground/70",
                    weekIndex === weeks.length - 1 &&
                      dayIndex === 0 &&
                      "rounded-bl-[7px]",
                    weekIndex === weeks.length - 1 &&
                      dayIndex === week.length - 1 &&
                      "rounded-br-[7px]",
                  )}
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-xs font-semibold text-[#344054] dark:text-foreground",
                        !calendarDay.inCurrentMonth &&
                          "text-[#98a2b3] dark:text-muted-foreground/70",
                      )}
                    >
                      {dayNumber(calendarDay.date)}
                    </span>
                  </div>
                  <div className="mt-1.5 grid min-w-0 gap-1">
                    {visibleEntries.map((entry) => (
                      <WfhNameBar key={entry.id} entry={entry} />
                    ))}
                  </div>
                  {hiddenEntries.length ? (
                    <div
                      ref={isOpen ? overflowTriggerRef : null}
                      className="absolute bottom-2 right-2"
                    >
                      <button
                        type="button"
                        aria-label={`Show all WFH people for ${dateLabel}`}
                        aria-expanded={isOpen}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] bg-[#eef2f8] text-[#344054] ring-1 ring-[#dfe4ee] transition-colors hover:bg-[#e6edf7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:bg-white/[0.055] dark:text-foreground dark:ring-white/[0.08] dark:hover:bg-white/[0.09]"
                        onClick={(event) =>
                          toggleOverflowMenu(calendarDay.date, event)
                        }
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            }),
          )}
        </div>
      </div>
      {openOverflowMenu && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={overflowMenuRef}
              role="dialog"
              aria-label={`WFH people for ${openOverflowDateLabel}`}
              className="fixed z-[1000] overflow-y-auto overscroll-contain rounded-[8px] bg-white p-2 shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-[#dfe4ee] [scrollbar-gutter:stable] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
              style={{
                left: openOverflowMenu.left,
                top: openOverflowMenu.top,
                width: openOverflowMenu.width,
                maxHeight: openOverflowMenu.maxHeight,
              }}
            >
              <div className="mb-2 truncate text-xs font-semibold uppercase tracking-wide text-[#667085] dark:text-muted-foreground">
                {openOverflowDateLabel}
              </div>
              <div className="grid gap-1">
                {openOverflowEntries.map((entry) => (
                  <div
                    key={`${entry.id}:overflow`}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-[7px] px-2 py-1.5 text-sm text-[#111827] dark:text-foreground"
                  >
                    <span className="min-w-0 truncate font-semibold">
                      {entry.name}
                    </span>
                    <span className="shrink-0 text-xs font-medium text-[#667085] dark:text-muted-foreground">
                      {wfhCoverageLabel(entry.coverage)}
                    </span>
                  </div>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function WorkLocationCalendar({
  data,
  initialView = "weekly-list",
}: {
  data: WorkLocationCalendarData;
  initialView?: CalendarView;
}) {
  const router = useRouter();
  const [view, setView] = useState<CalendarView>(initialView);
  const [myPlans, setMyPlans] = useState(data.myPlans);
  const [rows, setRows] = useState(data.rows);
  const [monthRows, setMonthRows] = useState(data.month.rows);
  const [savingPlanDates, setSavingPlanDates] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const savingPlanDatesRef = useRef<Set<string>>(new Set());
  const isWfhCalendar = view === "wfh-calendar";
  const previousWeek = addReportDateDays(data.weekStart, -7);
  const nextWeek = addReportDateDays(data.weekStart, 7);
  const previousMonth = selectedMonthDate(data.month.monthStart, -1);
  const nextMonth = selectedMonthDate(data.month.monthStart, 1);
  const today = todayDateString();
  const currentWeekSelected = today >= data.weekStart && today <= data.weekEnd;
  const currentMonthSelected =
    monthKeyFromDate(today) === monthKeyFromDate(data.month.monthStart);
  const previousPeriod = isWfhCalendar ? previousMonth : previousWeek;
  const nextPeriod = isWfhCalendar ? nextMonth : nextWeek;
  const currentPeriodSelected = isWfhCalendar
    ? currentMonthSelected
    : currentWeekSelected;
  const currentPeriodLabel = isWfhCalendar ? "This month" : "This week";
  const periodLabel = isWfhCalendar
    ? monthLabel(data.month.monthStart)
    : weekRangeLabel(data.weekStart, data.weekEnd);
  const myPlanByDate = useMemo(
    () => new Map(myPlans.map((plan) => [plan.date, plan])),
    [myPlans],
  );
  const savingPlanDateSet = useMemo(
    () => new Set(savingPlanDates),
    [savingPlanDates],
  );
  const weekdayDates = useMemo(
    () => data.dates.filter(isWeekdayDate),
    [data.dates],
  );
  const weekdayDateSet = useMemo(() => new Set(weekdayDates), [weekdayDates]);
  const normalizedEmployeeSearch = employeeSearch.trim().toLowerCase();
  const filteredRows = useMemo(
    () =>
      normalizedEmployeeSearch
        ? rows.filter((row) =>
            rowSearchText(row).includes(normalizedEmployeeSearch),
          )
        : rows,
    [normalizedEmployeeSearch, rows],
  );
  const filteredMonthRows = useMemo(
    () =>
      normalizedEmployeeSearch
        ? monthRows.filter((row) =>
            rowSearchText(row).includes(normalizedEmployeeSearch),
          )
        : monthRows,
    [monthRows, normalizedEmployeeSearch],
  );
  const calendarEntriesByDate = useMemo(
    () => wfhEntriesByDate(filteredMonthRows),
    [filteredMonthRows],
  );

  useEffect(() => {
    setMyPlans(data.myPlans);
    setRows(data.rows);
    setMonthRows(data.month.rows);
    savingPlanDatesRef.current.clear();
    setSavingPlanDates([]);
    setEmployeeSearch("");
    setMessage(null);
  }, [data]);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  function goToCalendarDate(
    date: string,
    departmentId = data.selectedDepartmentId,
    nextView = view,
  ) {
    if (!date) {
      return;
    }

    router.push(calendarHref(date, departmentId, nextView));
  }

  function switchView(nextView: CalendarView) {
    setView(nextView);
    router.push(
      calendarHref(
        nextView === "wfh-calendar" ? data.month.monthStart : data.weekStart,
        data.selectedDepartmentId,
        nextView,
      ),
    );
  }

  async function saveWeeklyPlan(
    dateString: string,
    nextLocation: PlannedWorkLocationValue | null,
  ) {
    if (savingPlanDatesRef.current.has(dateString)) {
      return;
    }

    savingPlanDatesRef.current.add(dateString);
    setSavingPlanDates(Array.from(savingPlanDatesRef.current));
    setMessage(null);

    try {
      const response = await fetch("/api/work-location-plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateString,
          workLocation: nextLocation,
        }),
      });

      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(response, "Unable to update weekly plan."),
        );
      }

      const body = (await response.json()) as {
        plan?: PlannedWorkLocation | null;
      };
      const nextPlan = body.plan ?? null;

      setMyPlans((current) => [
        ...current.filter((plan) => plan.date !== dateString),
        ...(nextPlan ? [nextPlan] : []),
      ]);
      setRows((current) =>
        current.map((row) =>
          row.user.id === data.viewerUserId
            ? {
                ...row,
                days: row.days.map((day) =>
                  day.date === dateString && day.source !== "REPORT"
                    ? {
                        ...day,
                        source: nextPlan ? "PLAN" : "NONE",
                        workLocation: nextPlan?.workLocation ?? null,
                      }
                    : day,
                ),
              }
            : row,
        ),
      );
      setMonthRows((current) =>
        current.map((row) =>
          row.user.id === data.viewerUserId
            ? {
                ...row,
                days: row.days.map((day) =>
                  day.date === dateString && day.source !== "REPORT"
                    ? {
                        ...day,
                        source: nextPlan ? "PLAN" : "NONE",
                        workLocation: nextPlan?.workLocation ?? null,
                      }
                    : day,
                ),
              }
            : row,
        ),
      );
      markServerDataStale();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update weekly plan.",
      );
    } finally {
      savingPlanDatesRef.current.delete(dateString);
      setSavingPlanDates(Array.from(savingPlanDatesRef.current));
    }
  }

  return (
    <main className="reference-page reference-page-contained work-location-page">
      <div className="reference-page-header gap-3">
        <div>
          <h1 className="reference-title">Work Locations</h1>
          <p className="mt-0.5 text-xs leading-5 text-[#667085] dark:text-muted-foreground">
            {periodLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            role="tablist"
            aria-label="Location view"
            className="inline-flex min-w-0 rounded-[8px] bg-[#f2f5f9] p-1 ring-1 ring-[#dfe5ef] dark:bg-white/[0.04] dark:ring-[#263a55]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === "weekly-list"}
              className={cn(
                calendarViewButtonClassName,
                view === "weekly-list"
                  ? "bg-white text-[#111827] shadow-sm dark:bg-[#101d2e] dark:text-foreground"
                  : "text-[#667085] hover:text-[#344054] dark:text-muted-foreground dark:hover:text-foreground",
              )}
              onClick={() => switchView("weekly-list")}
            >
              Weekly list
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "wfh-calendar"}
              className={cn(
                calendarViewButtonClassName,
                view === "wfh-calendar"
                  ? "bg-white text-[#111827] shadow-sm dark:bg-[#101d2e] dark:text-foreground"
                  : "text-[#667085] hover:text-[#344054] dark:text-muted-foreground dark:hover:text-foreground",
              )}
              onClick={() => switchView("wfh-calendar")}
            >
              WFH calendar
            </button>
          </div>
          <Link
            href={calendarHref(previousPeriod, data.selectedDepartmentId, view)}
            className={weekNavButtonClassName}
          >
            <ArrowLeft className="h-4 w-4" />
            {isWfhCalendar ? "Previous month" : "Previous week"}
          </Link>
          <Link
            href={calendarHref(today, data.selectedDepartmentId, view)}
            aria-disabled={currentPeriodSelected}
            className={cn(
              weekNavButtonClassName,
              currentPeriodSelected &&
                "pointer-events-none text-[#98a2b3] dark:text-muted-foreground",
            )}
          >
            <CalendarDays className="h-4 w-4" />
            {currentPeriodLabel}
          </Link>
          <Link
            href={calendarHref(nextPeriod, data.selectedDepartmentId, view)}
            className={weekNavButtonClassName}
          >
            {isWfhCalendar ? "Next month" : "Next week"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {view === "weekly-list" && data.canPlanOwnWeek ? (
        <section
          className="reference-card border-[#e7edf5] p-3 shadow-none dark:border-[#23344c]"
          aria-label="Weekday plan"
        >
          {message ? (
            <div className="mb-2 flex justify-end">
              <div
                className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#2563eb] dark:bg-blue-400/10 dark:text-blue-200"
                role="status"
              >
                {message}
              </div>
            </div>
          ) : null}
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {weekdayDates.map((date) => {
              const plan = myPlanByDate.get(date);
              const saving = savingPlanDateSet.has(date);

              return (
                <div
                  key={date}
                  className={cn(
                    "grid min-w-0 gap-2 rounded-[8px] bg-[#f5f7fb] p-2.5 transition-colors dark:bg-white/[0.035]",
                    plan &&
                      "bg-[#edf4ff] dark:bg-blue-400/[0.075]",
                  )}
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <span className="shrink-0 text-lg font-semibold leading-none text-[#111827] dark:text-foreground">
                        {dayNumber(date)}
                      </span>
                      <span className="truncate text-[11px] font-semibold uppercase text-[#667085] dark:text-muted-foreground">
                        {weekdayLabel(date)}
                      </span>
                    </div>
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#2563eb]" />
                    ) : null}
                  </div>
                  <Select
                    aria-label={`Plan for ${dayLabel(date)}`}
                    className="h-9 border-transparent bg-white/90 text-xs dark:border-transparent dark:bg-[#101d2e]"
                    value={plan?.workLocation ?? ""}
                    disabled={saving}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      void saveWeeklyPlan(
                        date,
                        nextValue
                          ? (nextValue as PlannedWorkLocationValue)
                          : null,
                      );
                    }}
                  >
                    <option value="">No plan</option>
                    {planLocationOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {view === "weekly-list" ? (
        <section className="reference-card p-4">
          <div className="mb-4 grid gap-3 min-[900px]:grid-cols-[minmax(220px,1fr)_220px_200px] min-[900px]:items-end">
            <label className="grid min-w-0 gap-1 text-sm font-semibold text-[#344054] dark:text-foreground">
              Search people
              <span className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667085]" />
                <input
                  value={employeeSearch}
                  onChange={(event) => setEmployeeSearch(event.target.value)}
                  placeholder="Search by name, email, or department"
                  aria-label="Search people"
                  className="h-10 w-full rounded-[8px] bg-[hsl(var(--field))] pl-9 pr-3 text-sm font-medium text-[#111827] shadow-none ring-1 ring-[#dfe4ee] transition-colors placeholder:text-[#98a2b3] hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:bg-[hsl(var(--field))] dark:text-foreground dark:ring-[#263a55] dark:hover:bg-white/5"
                />
              </span>
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-semibold text-[#344054] dark:text-foreground">
              Department
              <Select
                aria-label="Department"
                value={data.selectedDepartmentId ?? ""}
                onChange={(event) =>
                  goToCalendarDate(
                    data.weekStart,
                    event.target.value ? event.target.value : null,
                    "weekly-list",
                  )
                }
              >
                <option value="">All visible departments</option>
                {data.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-semibold text-[#344054] dark:text-foreground">
              Jump to week
              <WeekPicker
                weekStart={data.weekStart}
                weekEnd={data.weekEnd}
                onSelectDate={(date) =>
                  goToCalendarDate(date, undefined, "weekly-list")
                }
              />
            </label>
          </div>

          <div className="reference-table-scroll">
            <table className="work-location-weekly-table border-separate border-spacing-0 text-left text-sm">
              <colgroup>
                <col className="work-location-person-column" />
                {weekdayDates.map((date) => (
                  <col key={date} className="work-location-day-column" />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-r border-[#edf2f7] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#667085] dark:border-white/[0.06] dark:bg-[#0f1b2a] dark:text-muted-foreground">
                    Person
                  </th>
                  {weekdayDates.map((date, dateIndex) => (
                    <th
                      key={date}
                      className={cn(
                        "min-w-[128px] border-b border-[#edf2f7] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#667085] dark:border-white/[0.06] dark:text-muted-foreground",
                        dateIndex > 0 && "border-l",
                      )}
                    >
                      {dayLabel(date)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.user.id}
                    className="group transition-colors hover:bg-[#f8fbff] dark:hover:bg-white/[0.035]"
                  >
                    <th className="sticky left-0 z-10 border-b border-r border-[#edf2f7] bg-white px-3 py-3 align-middle transition-colors group-hover:bg-[#f8fbff] dark:border-white/[0.06] dark:bg-[#0f1b2a] dark:group-hover:bg-[#111c2d]">
                      <div
                        className="truncate font-semibold text-[#111827] dark:text-foreground"
                        title={displayName(row.user)}
                      >
                        {displayName(row.user)}
                      </div>
                      <div
                        className="mt-0.5 truncate text-xs font-medium text-[#667085] dark:text-muted-foreground"
                        title={employeeDepartmentLabel(row.user)}
                      >
                        {employeeDepartmentLabel(row.user)}
                      </div>
                    </th>
                    {row.days
                      .filter((day) => weekdayDateSet.has(day.date))
                      .map((day, dayIndex) => (
                        <td
                          key={day.date}
                          className={cn(
                            "border-b border-[#edf2f7] px-3 py-3 align-middle transition-colors dark:border-white/[0.06]",
                            dayIndex > 0 && "border-l",
                          )}
                        >
                          <LocationCell day={day} />
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredRows.length === 0 ? (
            <div className="mt-3 rounded-[8px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-6 text-center text-sm text-[#667085] dark:border-[#263a55] dark:bg-white/[0.03] dark:text-muted-foreground">
              {rows.length === 0
                ? "No employees found for this department view."
                : "No people match your search."}
            </div>
          ) : null}
        </section>
      ) : null}

      {view === "wfh-calendar" ? (
        <section className="reference-card p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-normal text-[#111827] dark:text-foreground">
                WFH calendar
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#667085] dark:text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-200">
                WFH
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-2.5 py-1 text-cyan-700 dark:text-cyan-200">
                AM
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-blue-700 dark:text-blue-200">
                PM
              </span>
            </div>
          </div>
          <div className="mb-4 grid gap-3 min-[900px]:grid-cols-[minmax(220px,1fr)_220px_200px] min-[900px]:items-end">
            <label className="grid min-w-0 gap-1 text-sm font-semibold text-[#344054] dark:text-foreground">
              Search people
              <span className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667085]" />
                <input
                  value={employeeSearch}
                  onChange={(event) => setEmployeeSearch(event.target.value)}
                  placeholder="Search by name, email, or department"
                  aria-label="Search people"
                  className="h-10 w-full rounded-[8px] bg-[hsl(var(--field))] pl-9 pr-3 text-sm font-medium text-[#111827] shadow-none ring-1 ring-[#dfe4ee] transition-colors placeholder:text-[#98a2b3] hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:bg-[hsl(var(--field))] dark:text-foreground dark:ring-[#263a55] dark:hover:bg-white/5"
                />
              </span>
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-semibold text-[#344054] dark:text-foreground">
              Department
              <Select
                aria-label="Department"
                value={data.selectedDepartmentId ?? ""}
                onChange={(event) =>
                  goToCalendarDate(
                    data.month.monthStart,
                    event.target.value ? event.target.value : null,
                    "wfh-calendar",
                  )
                }
              >
                <option value="">All visible departments</option>
                {data.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-semibold text-[#344054] dark:text-foreground">
              Jump to month
              <MonthPicker
                monthStart={data.month.monthStart}
                onSelectDate={(date) =>
                  goToCalendarDate(date, undefined, "wfh-calendar")
                }
              />
            </label>
          </div>
          <WfhCalendarGrid
            dates={data.month.dates}
            entriesByDate={calendarEntriesByDate}
          />
          {filteredMonthRows.length === 0 ? (
            <div className="mt-3 rounded-[8px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-6 text-center text-sm text-[#667085] dark:border-[#263a55] dark:bg-white/[0.03] dark:text-muted-foreground">
              {monthRows.length === 0
                ? "No employees found for this department view."
                : "No people match your search."}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
