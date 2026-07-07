"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Loader2,
} from "lucide-react";

import { useDismissableLayer } from "@/components/ui/use-dismissable-layer";
import { dateOnlyDisplayDate, dateOnlyString } from "@/lib/date-only";
import { addReportDateDays } from "@/lib/dates";
import { anchoredFixedPlacement } from "@/lib/anchored-position";
import { cn } from "@/lib/utils";

export type ReportDateControl = "previous" | "next" | "picker" | "today";

type ReportDateSwitcherProps = {
  value: string | Date;
  maxDate: string;
  pendingControl?: ReportDateControl | null;
  disabled?: boolean;
  className?: string;
  onChange: (date: string, control: ReportDateControl) => void;
};

type CalendarPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

const dateNavButtonClassName =
  "flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground dark:disabled:hover:bg-transparent dark:disabled:hover:text-muted-foreground";

function twoDigit(value: number) {
  return String(value).padStart(2, "0");
}

function dateStringFromParts(year: number, monthIndex: number, day: number) {
  return `${year}-${twoDigit(monthIndex + 1)}-${twoDigit(day)}`;
}

function monthKeyFromDate(value: string | Date) {
  return dateOnlyString(value).slice(0, 7);
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

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dateOnlyDisplayDate(value));
}

function formatMonthLabel(monthKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(monthDateFromKey(monthKey));
}

export function ReportDateSwitcher({
  value,
  maxDate,
  pendingControl = null,
  disabled = false,
  className,
  onChange,
}: ReportDateSwitcherProps) {
  const currentDate = dateOnlyString(value);
  const normalizedMaxDate = dateOnlyString(maxDate);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() =>
    monthKeyFromDate(currentDate),
  );
  const [calendarPosition, setCalendarPosition] =
    useState<CalendarPosition | null>(null);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const canGoToNextDate = currentDate < normalizedMaxDate;
  const calendarDays = calendarDaysForMonth(pickerMonth);
  const canGoToNextCalendarMonth =
    addCalendarMonths(pickerMonth, 1) <= monthKeyFromDate(normalizedMaxDate);

  const updateCalendarPosition = useCallback(() => {
    if (typeof window === "undefined" || !switcherRef.current) {
      return;
    }

    const rect = switcherRef.current.getBoundingClientRect();
    const placement = anchoredFixedPlacement({
      anchorRect: rect,
      preferredWidth: Math.max(rect.width, 300),
      preferredMaxHeight: 372,
      minHeight: 220,
      flipHeight: 260,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      viewportPadding: 8,
      gap: 6,
      align: "start",
    });

    setCalendarPosition({
      left: placement.left,
      top: placement.top,
      width: placement.width,
      maxHeight: placement.maxHeight,
    });
  }, []);

  useDismissableLayer({
    open: pickerOpen,
    refs: [switcherRef, pickerRef],
    onDismiss: () => setPickerOpen(false),
  });

  useEffect(() => {
    setPickerMonth(monthKeyFromDate(currentDate));
  }, [currentDate]);

  useEffect(() => {
    if (!pickerOpen) {
      setCalendarPosition(null);
      return undefined;
    }

    window.addEventListener("resize", updateCalendarPosition);
    window.addEventListener("scroll", updateCalendarPosition, true);
    updateCalendarPosition();

    return () => {
      window.removeEventListener("resize", updateCalendarPosition);
      window.removeEventListener("scroll", updateCalendarPosition, true);
    };
  }, [pickerOpen, updateCalendarPosition]);

  function openPicker() {
    if (disabled) {
      return;
    }

    if (!pickerOpen) {
      updateCalendarPosition();
    }

    setPickerMonth(monthKeyFromDate(currentDate));
    setPickerOpen((open) => !open);
  }

  function selectDate(nextDate: string) {
    setPickerOpen(false);
    onChange(nextDate, "picker");
  }

  return (
    <div
      ref={switcherRef}
      className={cn(
        "relative grid h-10 w-full min-w-0 grid-cols-[2rem_minmax(0,1fr)_2rem_2rem] items-center gap-0.5 rounded-lg bg-white p-1 shadow-none ring-1 ring-border min-[520px]:w-[300px] dark:bg-card dark:ring-border",
        className,
      )}
    >
      <button
        type="button"
        className={dateNavButtonClassName}
        aria-label="Previous day"
        title="Previous day"
        onClick={() => onChange(addReportDateDays(currentDate, -1), "previous")}
        disabled={disabled}
      >
        {pendingControl === "previous" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>
      <button
        type="button"
        className="flex h-8 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-sm px-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-70 dark:text-foreground dark:hover:bg-white/5"
        onClick={openPicker}
        aria-label="Open report date picker"
        disabled={disabled}
      >
        {pendingControl === "picker" ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-foreground-muted dark:text-muted-foreground" />
        ) : (
          <CalendarDays className="h-4 w-4 shrink-0 text-foreground-muted dark:text-muted-foreground" />
        )}
        <span className="truncate">{formatDate(currentDate)}</span>
      </button>
      {canGoToNextDate ? (
        <button
          type="button"
          className={dateNavButtonClassName}
          aria-label="Next day"
          title="Next day"
          onClick={() => onChange(addReportDateDays(currentDate, 1), "next")}
          disabled={disabled}
        >
          {pendingControl === "next" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
      {canGoToNextDate ? (
        <button
          type="button"
          className={dateNavButtonClassName}
          aria-label="Jump to today"
          title="Jump to today"
          onClick={() => onChange(normalizedMaxDate, "today")}
          disabled={disabled}
        >
          {pendingControl === "today" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ChevronsRight className="h-4 w-4" />
          )}
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
      <input
        type="date"
        value={currentDate}
        max={normalizedMaxDate}
        onChange={(event) => onChange(event.target.value, "picker")}
        disabled={disabled}
        className="pointer-events-none absolute left-1/2 top-1/2 h-px w-px -translate-x-1/2 -translate-y-1/2 border-0 p-0 opacity-0"
        aria-label="Select report date"
      />
      {pickerOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={pickerRef}
              role="dialog"
              aria-label="Report date picker"
              className="fixed z-[1000] overflow-y-auto overscroll-contain rounded-lg bg-white p-2 shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-border [scrollbar-gutter:stable] dark:bg-card dark:ring-border"
              style={{
                left: calendarPosition?.left ?? 0,
                top: calendarPosition?.top ?? 0,
                width: calendarPosition?.width,
                maxHeight: calendarPosition?.maxHeight,
                visibility: calendarPosition ? "visible" : "hidden",
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
                <div className="text-sm font-semibold text-foreground dark:text-foreground">
                  {formatMonthLabel(pickerMonth)}
                </div>
                <button
                  type="button"
                  className="reference-menu-button"
                  aria-label="Next month"
                  disabled={!canGoToNextCalendarMonth}
                  onClick={() =>
                    setPickerMonth((month) => addCalendarMonths(month, 1))
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 px-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (weekday) => (
                    <span key={weekday}>{weekday}</span>
                  ),
                )}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((calendarDay) => {
                  const isSelected = calendarDay.value === currentDate;
                  const isFuture = calendarDay.value > normalizedMaxDate;

                  return (
                    <button
                      key={calendarDay.value}
                      type="button"
                      className={cn(
                        "flex h-9 items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        calendarDay.inCurrentMonth
                          ? "text-foreground hover:bg-primary-subtle dark:text-foreground dark:hover:bg-white/10"
                          : "text-muted-foreground-subtle hover:bg-surface-subtle dark:text-muted-foreground/70 dark:hover:bg-white/5",
                        isSelected &&
                          "bg-primary text-white hover:bg-primary dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400",
                        isFuture &&
                          "cursor-not-allowed opacity-35 hover:bg-transparent dark:hover:bg-transparent",
                      )}
                      aria-label={`Select ${formatDate(calendarDay.value)}`}
                      aria-current={isSelected ? "date" : undefined}
                      disabled={isFuture || disabled}
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
