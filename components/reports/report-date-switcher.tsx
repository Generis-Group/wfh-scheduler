"use client";

import { useEffect, useRef, useState } from "react";
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

const dateNavButtonClassName =
  "flex h-8 w-8 items-center justify-center rounded-[6px] text-[#667085] transition-colors hover:bg-[#eef2f7] hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#667085] dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground dark:disabled:hover:bg-transparent dark:disabled:hover:text-muted-foreground";

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
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const canGoToNextDate = currentDate < normalizedMaxDate;
  const calendarDays = calendarDaysForMonth(pickerMonth);
  const canGoToNextCalendarMonth =
    addCalendarMonths(pickerMonth, 1) <= monthKeyFromDate(normalizedMaxDate);

  useDismissableLayer({
    open: pickerOpen,
    refs: [switcherRef],
    onDismiss: () => setPickerOpen(false),
  });

  useEffect(() => {
    setPickerMonth(monthKeyFromDate(currentDate));
  }, [currentDate]);

  function openPicker() {
    if (disabled) {
      return;
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
        "relative grid h-10 w-full min-w-0 grid-cols-[2rem_minmax(0,1fr)_2rem_2rem] items-center gap-0.5 rounded-[8px] bg-white p-1 shadow-none ring-1 ring-[#dfe4ee] min-[520px]:w-[300px] dark:bg-[#101d2e] dark:ring-[#263a55]",
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
        className="flex h-8 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-[6px] px-2 text-sm font-semibold text-[#111827] transition-colors hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:cursor-not-allowed disabled:opacity-70 dark:text-foreground dark:hover:bg-white/5"
        onClick={openPicker}
        aria-label="Open report date picker"
        disabled={disabled}
      >
        {pendingControl === "picker" ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#475467] dark:text-muted-foreground" />
        ) : (
          <CalendarDays className="h-4 w-4 shrink-0 text-[#475467] dark:text-muted-foreground" />
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
      {pickerOpen ? (
        <div className="absolute left-0 top-11 z-30 w-full min-w-[300px] rounded-[8px] bg-white p-2 shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-[#dfe4ee] dark:bg-[#0f1b2a] dark:ring-[#263a55]">
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
              disabled={!canGoToNextCalendarMonth}
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
              const isSelected = calendarDay.value === currentDate;
              const isFuture = calendarDay.value > normalizedMaxDate;

              return (
                <button
                  key={calendarDay.value}
                  type="button"
                  className={cn(
                    "flex h-9 items-center justify-center rounded-[7px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]",
                    calendarDay.inCurrentMonth
                      ? "text-[#111827] hover:bg-[#eff6ff] dark:text-foreground dark:hover:bg-white/10"
                      : "text-[#98a2b3] hover:bg-[#f8fafc] dark:text-muted-foreground/70 dark:hover:bg-white/5",
                    isSelected &&
                      "bg-[#2563eb] text-white hover:bg-[#1d4ed8] dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400",
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
        </div>
      ) : null}
    </div>
  );
}
