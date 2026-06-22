import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { addReportDateDays } from "@/lib/dates";
import {
  workLocationLabel,
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

export type WorkLocationCalendarData = {
  weekStart: string;
  weekEnd: string;
  dates: string[];
  departments: CalendarDepartment[];
  selectedDepartmentId: string | null;
  rows: Array<{
    user: CalendarUser;
    days: CalendarDay[];
  }>;
};

function displayName(user: CalendarUser) {
  return user.name || user.email || "Employee";
}

function employeeDepartmentLabel(user: CalendarUser) {
  const departments =
    user.departments
      ?.filter((membership) => membership.role === "EMPLOYEE")
      .map((membership) => membership.department?.name)
      .filter(Boolean) ?? [];

  return departments.length ? departments.join(", ") : "No department";
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function weekRangeLabel(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return `${formatter.format(new Date(`${start}T12:00:00.000Z`))} - ${formatter.format(new Date(`${end}T12:00:00.000Z`))}`;
}

function locationTone(location: WorkLocationValue | null) {
  if (location === "OFFICE") {
    return "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-400/10 dark:text-blue-200 dark:ring-blue-300/15";
  }

  if (location === "WFH") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-300/15";
  }

  if (location === "OFFICE_AM_WFH_PM" || location === "WFH_AM_OFFICE_PM") {
    return "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-400/10 dark:text-violet-200 dark:ring-violet-300/15";
  }

  if (location === "PTO" || location === "OUT_OF_OFFICE") {
    return "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/[0.05] dark:text-slate-200 dark:ring-white/10";
  }

  return "bg-white text-[#94a3b8] ring-[#e5eaf2] dark:bg-white/[0.03] dark:text-[#64748b] dark:ring-[#263a55]";
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

function calendarHref(date: string, departmentId?: string | null) {
  const params = new URLSearchParams({ date });

  if (departmentId) {
    params.set("departmentId", departmentId);
  }

  return `/calendar?${params.toString()}`;
}

export function WorkLocationCalendar({
  data,
}: {
  data: WorkLocationCalendarData;
}) {
  const previousWeek = addReportDateDays(data.weekStart, -7);
  const nextWeek = addReportDateDays(data.weekStart, 7);

  return (
    <main className="reference-page">
      <div className="reference-page-header">
        <div>
          <h1 className="reference-title">Work Locations</h1>
          <p className="mt-0.5 text-xs leading-5 text-[#667085] dark:text-muted-foreground">
            {weekRangeLabel(data.weekStart, data.weekEnd)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={calendarHref(previousWeek, data.selectedDepartmentId)}
            className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-white px-3 text-sm font-semibold text-[#344054] ring-1 ring-[#dfe5ef] transition-colors hover:bg-[#f8fafc] dark:bg-white/[0.04] dark:text-foreground dark:ring-[#263a55] dark:hover:bg-white/[0.08]"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Link>
          <Link
            href={calendarHref(nextWeek, data.selectedDepartmentId)}
            className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-white px-3 text-sm font-semibold text-[#344054] ring-1 ring-[#dfe5ef] transition-colors hover:bg-[#f8fafc] dark:bg-white/[0.04] dark:text-foreground dark:ring-[#263a55] dark:hover:bg-white/[0.08]"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <section className="reference-card p-3">
        <form
          className="mb-3 flex flex-wrap items-center gap-2"
          action="/calendar"
        >
          <input type="hidden" name="date" value={data.weekStart} />
          <label className="flex min-w-[220px] items-center gap-2 text-sm font-semibold text-[#344054] dark:text-foreground">
            Department
            <select
              name="departmentId"
              defaultValue={data.selectedDepartmentId ?? ""}
              className="h-9 min-w-0 rounded-[8px] bg-white px-3 text-sm font-medium text-[#111827] ring-1 ring-[#dfe5ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:bg-[#101d2e] dark:text-foreground dark:ring-[#263a55]"
            >
              <option value="">All visible departments</option>
              {data.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-[8px] bg-[#2563eb] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#1d4ed8]"
          >
            Apply
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-56 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#667085] dark:bg-[#0f1b2a] dark:text-muted-foreground">
                  Person
                </th>
                {data.dates.map((date) => (
                  <th
                    key={date}
                    className="min-w-28 border-l border-[#e5eaf2] px-2 py-2 text-xs font-semibold uppercase tracking-wide text-[#667085] dark:border-[#263a55] dark:text-muted-foreground"
                  >
                    {dayLabel(date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.user.id}>
                  <th className="sticky left-0 z-10 border-t border-[#e5eaf2] bg-white px-3 py-2 align-top dark:border-[#263a55] dark:bg-[#0f1b2a]">
                    <div className="font-semibold text-[#111827] dark:text-foreground">
                      {displayName(row.user)}
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-[#667085] dark:text-muted-foreground">
                      {employeeDepartmentLabel(row.user)}
                    </div>
                  </th>
                  {row.days.map((day) => (
                    <td
                      key={day.date}
                      className="border-l border-t border-[#e5eaf2] px-2 py-2 align-top dark:border-[#263a55]"
                    >
                      <span
                        className={cn(
                          "inline-flex min-h-8 max-w-full flex-col justify-center rounded-[8px] px-2.5 py-1 text-xs font-semibold ring-1",
                          locationTone(day.workLocation),
                        )}
                      >
                        <span className="truncate">
                          {day.workLocation
                            ? workLocationLabel(day.workLocation)
                            : "-"}
                        </span>
                        {day.source !== "NONE" ? (
                          <span className="mt-0.5 text-[10px] uppercase tracking-wide opacity-70">
                            {sourceLabel(day.source)}
                          </span>
                        ) : null}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.rows.length === 0 ? (
          <div className="mt-3 rounded-[8px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-6 text-center text-sm text-[#667085] dark:border-[#263a55] dark:bg-white/[0.03] dark:text-muted-foreground">
            No employees found for this department view.
          </div>
        ) : null}
      </section>
    </main>
  );
}
