"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Edit3,
  FilePenLine,
  ListChecks,
  LockKeyhole,
  MoreVertical,
  PenLine,
  Plus,
  Send
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyReferenceState, ReferenceAppShell, ReferenceBadge, ReferencePanel } from "@/components/reports/reference-shell";
import { cn, titleCase } from "@/lib/utils";

type ActivitySource = "JIRA" | "GOOGLE_CALENDAR" | "GOOGLE_TASKS" | "MANUAL";

type Activity = {
  id: string;
  source: ActivitySource;
  title: string;
  description?: string | null;
  status?: string | null;
  sourceUrl?: string | null;
  startedAt?: string | Date | null;
  durationMinutes?: number | null;
  selected: boolean;
  employeeNote?: string | null;
};

type Report = {
  id: string;
  reportDate: string | Date;
  workLocation: "OFFICE" | "WFH" | "HYBRID" | "PTO" | "OUT_OF_OFFICE" | "UNKNOWN";
  summary: string;
  blockers: string;
  status: "DRAFT" | "SUBMITTED";
  submittedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  activities: Activity[];
};

type HistoryItem = {
  id: string;
  reportDate: string | Date;
  status: "DRAFT" | "SUBMITTED" | "MISSING";
  editedAfterDate?: boolean;
};

const sourceLabels: Record<ActivitySource, string> = {
  JIRA: "Jira",
  GOOGLE_CALENDAR: "Google Calendar",
  GOOGLE_TASKS: "Google Tasks",
  MANUAL: "Manual"
};

const sourceStyles: Record<ActivitySource, string> = {
  JIRA: "bg-[#2563eb]",
  GOOGLE_CALENDAR: "bg-[#facc15]",
  GOOGLE_TASKS: "bg-white border border-[#2563eb]",
  MANUAL: "bg-white border border-[#2563eb]"
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

function formatReportDate(value: string | Date) {
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

function formatDuration(minutes?: number | null) {
  if (!minutes) {
    return "-";
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (!hours) {
    return `${remaining}m`;
  }

  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function statusTone(status?: string | null): "green" | "orange" | "blue" | "neutral" {
  const normalized = status?.toLowerCase() ?? "";

  if (normalized.includes("done") || normalized.includes("complete") || normalized.includes("submitted")) {
    return "green";
  }

  if (normalized.includes("progress")) {
    return "blue";
  }

  if (normalized.includes("late") || normalized.includes("todo") || normalized.includes("draft")) {
    return "orange";
  }

  return "neutral";
}

function sourceIcon(source: ActivitySource) {
  if (source === "GOOGLE_CALENDAR") {
    return <CalendarDays className="h-3.5 w-3.5 text-[#2563eb]" />;
  }

  if (source === "GOOGLE_TASKS") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-[#2563eb]" />;
  }

  if (source === "MANUAL") {
    return <PenLine className="h-3.5 w-3.5 text-[#2563eb]" />;
  }

  return <div className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-white" />;
}

export function DailyReportApp({
  initialReport,
  date,
  userName,
  userRole,
  history = [],
  isPreview = false
}: {
  initialReport: Report;
  date: string;
  userName?: string | null;
  userRole?: string | null;
  history?: HistoryItem[];
  isPreview?: boolean;
}) {
  const [report, setReport] = useState(initialReport);
  const [summary, setSummary] = useState(initialReport.summary);
  const [blockers, setBlockers] = useState(initialReport.blockers);
  const [workLocation, setWorkLocation] = useState(initialReport.workLocation);
  const [activities, setActivities] = useState(initialReport.activities);
  const [manualTitle, setManualTitle] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const selectedCount = useMemo(() => activities.filter((activity) => activity.selected).length, [activities]);
  const reportDate = dateInputValue(date);
  const submittedAt = toDate(report.submittedAt);
  const updatedAt = toDate(report.updatedAt);
  const dayEnd = new Date(`${reportDate}T23:59:59.999`);
  const isLate = Boolean(submittedAt && submittedAt > dayEnd);
  const editedAfterDate = Boolean(updatedAt && updatedAt > dayEnd);

  function setActivity(id: string, patch: Partial<Activity>) {
    setActivities((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function shiftReportDate(days: number) {
    const nextDate = toDate(reportDate) ?? new Date();
    nextDate.setDate(nextDate.getDate() + days);
    const nextValue = nextDate.toISOString().slice(0, 10);
    window.location.href = isPreview ? `/preview/employee?date=${nextValue}` : `/?date=${nextValue}`;
  }

  async function saveReport(submit = false) {
    setIsBusy(true);
    setMessage(null);

    const manualActivities = manualTitle.trim()
      ? [
          {
            title: manualTitle.trim(),
            employeeNote: manualNote.trim() || null
          }
        ]
      : [];

    if (isPreview) {
      const nextActivities = manualActivities.length
        ? [
            ...activities,
            {
              id: `manual-${Date.now()}`,
              source: "MANUAL" as const,
              title: manualActivities[0].title,
              selected: true,
              employeeNote: manualActivities[0].employeeNote
            }
          ]
        : activities;

      setActivities(nextActivities);
      setReport((current) => ({
        ...current,
        status: submit ? "SUBMITTED" : current.status,
        summary,
        blockers,
        workLocation,
        submittedAt: submit ? new Date().toISOString() : current.submittedAt,
        updatedAt: new Date().toISOString(),
        activities: nextActivities
      }));
      setManualTitle("");
      setManualNote("");
      setShowManual(false);
      setMessage(submit ? "Preview submitted." : "Preview saved.");
      setIsBusy(false);
      return;
    }

    const response = await fetch(`/api/reports/${report.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary,
        blockers,
        workLocation,
        activityUpdates: activities.map((activity) => ({
          id: activity.id,
          selected: activity.selected,
          employeeNote: activity.employeeNote ?? null
        })),
        manualActivities
      })
    });

    if (!response.ok) {
      setMessage((await response.json()).error ?? "Unable to save report.");
      setIsBusy(false);
      return;
    }

    const data = await response.json();
    let nextReport = data.report as Report;

    if (submit) {
      const submitResponse = await fetch(`/api/reports/${nextReport.id}/submit`, { method: "POST" });
      if (!submitResponse.ok) {
        setMessage((await submitResponse.json()).error ?? "Unable to submit report.");
        setIsBusy(false);
        return;
      }
      nextReport = (await submitResponse.json()).report as Report;
    }

    setReport(nextReport);
    setActivities(nextReport.activities);
    setManualTitle("");
    setManualNote("");
    setShowManual(false);
    setMessage(submit ? "Submitted for review." : "Draft saved.");
    setIsBusy(false);
  }

  async function sync(provider: "jira" | "google-calendar" | "google-tasks") {
    setIsBusy(true);
    setMessage(null);

    if (isPreview) {
      setMessage(`${provider.replace("-", " ")} preview refresh complete.`);
      setIsBusy(false);
      return;
    }

    const response = await fetch(`/api/sync/${provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date })
    });

    if (!response.ok) {
      setMessage((await response.json()).error ?? "Sync failed.");
      setIsBusy(false);
      return;
    }

    window.location.reload();
  }

  return (
    <ReferenceAppShell active="report" variant="employee" userName={userName} userRole={userRole} preview={isPreview}>
      <main className="w-full px-[clamp(16px,2vw,34px)] pb-8 pt-8">
        <h1 className="mb-5 text-[26px] font-semibold tracking-normal text-[#0f172a]">Daily Report</h1>

        <ReferencePanel className="mb-5 grid gap-0 divide-y divide-[#e2e8f0] p-4 min-[1120px]:grid-cols-[300px_220px_300px_1fr] min-[1120px]:divide-x min-[1120px]:divide-y-0">
          <div className="px-2 py-1">
            <div className="mb-3 text-xs font-medium text-[#64748b]">Report Date</div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="outline"
                className="h-11 w-11 border-[#d9e1ec]"
                onClick={() => shiftReportDate(-1)}
                aria-label="Previous report date"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <label className="relative flex h-11 flex-1 items-center gap-3 rounded-[6px] border border-[#d9e1ec] bg-white px-3 text-sm font-medium text-[#0f172a]">
                <CalendarDays className="h-4 w-4 text-[#475569]" />
                <span className="pointer-events-none absolute left-10 whitespace-nowrap">{formatReportDate(date)}</span>
                <Input
                  type="date"
                  value={reportDate}
                  onChange={(event) => {
                    window.location.href = isPreview ? `/preview/employee?date=${event.target.value}` : `/?date=${event.target.value}`;
                  }}
                  className="h-full border-0 bg-transparent pl-0 pr-0 opacity-0"
                  aria-label="Report date"
                />
              </label>
              <Button
                size="icon"
                variant="outline"
                className="h-11 w-11 border-[#d9e1ec]"
                onClick={() => shiftReportDate(1)}
                aria-label="Next report date"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="px-7 py-1">
            <div className="mb-3 text-xs font-medium text-[#64748b]">Report Status</div>
            <ReferenceBadge tone={report.status === "SUBMITTED" ? "green" : "orange"}>{titleCase(report.status)}</ReferenceBadge>
            <div className="mt-2 text-sm text-[#64748b]">
              {report.submittedAt ? `Submitted ${formatTimestamp(report.submittedAt)}` : "Not submitted yet"}
            </div>
          </div>

          <div className="px-7 py-1">
            <div className="mb-3 text-xs font-medium text-[#64748b]">Work Location</div>
            <Select value={workLocation} onChange={(event) => setWorkLocation(event.target.value as typeof workLocation)} className="h-12 border-[#d9e1ec]">
              <option value="UNKNOWN">Unspecified</option>
              <option value="OFFICE">Office</option>
              <option value="WFH">WFH</option>
              <option value="HYBRID">Hybrid</option>
              <option value="PTO">PTO</option>
              <option value="OUT_OF_OFFICE">Out of office</option>
            </Select>
          </div>

          <div className="grid gap-4 px-7 py-1 sm:grid-cols-2">
            <div className={cn("rounded-[6px] border p-4", isLate ? "border-[#fed7aa] bg-[#fffaf5]" : "border-[#d9e1ec] bg-[#f8fafc]")}>
              <div className={cn("flex items-center gap-2 text-sm font-semibold", isLate ? "text-[#ea580c]" : "text-[#64748b]")}>
                <Clock3 className="h-4 w-4" />
                {isLate ? "Late submission" : "On-time status"}
              </div>
              <div className="mt-2 text-sm text-[#475569]">{isLate ? "Submitted after day end" : "No late submission recorded"}</div>
            </div>
            <div className={cn("rounded-[6px] border p-4", editedAfterDate ? "border-[#fed7aa] bg-[#fffaf5]" : "border-[#d9e1ec] bg-[#f8fafc]")}>
              <div className={cn("flex items-center gap-2 text-sm font-semibold", editedAfterDate ? "text-[#ea580c]" : "text-[#64748b]")}>
                <Edit3 className="h-4 w-4" />
                {editedAfterDate ? "Edited after date" : "No later edits"}
              </div>
              <div className="mt-2 text-sm text-[#475569]">{editedAfterDate ? `Edited ${formatTimestamp(updatedAt)}` : "Latest version is current"}</div>
            </div>
          </div>
        </ReferencePanel>

        <div className="grid gap-4 min-[1120px]:grid-cols-[minmax(0,1fr)_390px] min-[1500px]:grid-cols-[minmax(0,1fr)_405px]">
          <ReferencePanel className="overflow-hidden">
            <div className="border-b border-[#e2e8f0] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#0f172a]">Activity Review</h2>
                  <p className="mt-1 text-sm text-[#475569]">Review and include activities for this report.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={isBusy} onClick={() => sync("jira")}>Jira</Button>
                  <Button variant="outline" size="sm" disabled={isBusy} onClick={() => sync("google-calendar")}>Calendar</Button>
                  <Button variant="outline" size="sm" disabled={isBusy} onClick={() => sync("google-tasks")}>Tasks</Button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] table-fixed text-sm">
                <thead className="border-b border-[#e2e8f0] bg-white text-left text-xs font-semibold text-[#475569]">
                  <tr>
                    <th className="w-14 px-5 py-4">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-[#cbd5e1] accent-[#2563eb]"
                        aria-label="Select all activities"
                        checked={activities.length > 0 && activities.every((activity) => activity.selected)}
                        onChange={(event) => {
                          setActivities((items) => items.map((item) => ({ ...item, selected: event.target.checked })));
                        }}
                      />
                    </th>
                    <th className="w-[17%] px-2 py-4">Source</th>
                    <th className="px-2 py-4">Title / Description</th>
                    <th className="w-[12%] px-2 py-4">Status</th>
                    <th className="w-[12%] px-2 py-4">Time / Duration</th>
                    <th className="w-[23%] px-2 py-4">Note</th>
                    <th className="w-10 px-4 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {activities.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8">
                        <EmptyReferenceState>No activities yet. Sync integrations or add a manual activity.</EmptyReferenceState>
                      </td>
                    </tr>
                  ) : (
                    activities.map((activity) => (
                      <tr key={activity.id} className="bg-white hover:bg-[#f8fafc]">
                        <td className="px-5 py-4">
                          <input
                            type="checkbox"
                            className="h-5 w-5 rounded border-[#cbd5e1] accent-[#2563eb]"
                            checked={activity.selected}
                            onChange={(event) => setActivity(activity.id, { selected: event.target.checked })}
                            aria-label={`Include ${activity.title}`}
                          />
                        </td>
                        <td className="px-2 py-4">
                          <div className="flex min-w-0 items-center gap-3 text-[#334155]">
                            <div className={cn("flex h-5 w-5 items-center justify-center rounded-[4px]", sourceStyles[activity.source])}>{sourceIcon(activity.source)}</div>
                            <span className="leading-tight">{sourceLabels[activity.source]}</span>
                          </div>
                        </td>
                        <td className="px-2 py-4">
                          <div className="font-semibold text-[#0f172a]">
                            {activity.sourceUrl && activity.sourceUrl !== "#" ? (
                              <a href={activity.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-[#2563eb]">
                                {activity.title}
                              </a>
                            ) : (
                              <span className="block truncate">{activity.title || "Untitled activity"}</span>
                            )}
                          </div>
                          {activity.description ? <div className="mt-1 max-w-lg truncate text-xs text-[#64748b]">{activity.description}</div> : null}
                        </td>
                        <td className="px-2 py-4">
                          <ReferenceBadge tone={statusTone(activity.status)}>{activity.status || "Not set"}</ReferenceBadge>
                        </td>
                        <td className="px-2 py-4 text-[#334155]">{formatDuration(activity.durationMinutes)}</td>
                        <td className="px-2 py-4">
                          <Input
                            placeholder="Add a note"
                            value={activity.employeeNote ?? ""}
                            onChange={(event) => setActivity(activity.id, { employeeNote: event.target.value })}
                            className="h-10 border-[#d9e1ec] text-sm"
                          />
                        </td>
                        <td className="px-4 py-4 text-[#64748b]">
                          <button
                            className="rounded-[6px] p-1 hover:bg-[#eef2f7]"
                            aria-label={`More actions for ${activity.title}`}
                            onClick={() => setMessage("Activity actions will be available once integrations are connected.")}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}

                  {showManual ? (
                    <tr>
                      <td className="px-5 py-4" />
                      <td className="px-2 py-4">
                        <div className="flex items-center gap-3 text-[#334155]">
                          <div className="flex h-5 w-5 items-center justify-center rounded-[4px] border border-[#2563eb]">
                            <PenLine className="h-3.5 w-3.5 text-[#2563eb]" />
                          </div>
                          Manual
                        </div>
                      </td>
                      <td className="px-2 py-4">
                        <Input placeholder="Activity title" value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} />
                      </td>
                      <td className="px-2 py-4">
                        <ReferenceBadge tone="neutral">Manual</ReferenceBadge>
                      </td>
                      <td className="px-2 py-4 text-[#64748b]">-</td>
                      <td className="px-2 py-4">
                        <Input placeholder="Optional note" value={manualNote} onChange={(event) => setManualNote(event.target.value)} />
                      </td>
                      <td className="px-4 py-4" />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="p-5">
              <button
                className="flex h-16 w-full items-center justify-center gap-2 rounded-[8px] border border-dashed border-[#cbd5e1] text-sm font-semibold text-[#2563eb] hover:bg-[#f8fafc]"
                onClick={() => setShowManual(true)}
              >
                <Plus className="h-5 w-5" />
                Add manual activity
              </button>
            </div>
          </ReferencePanel>

          <aside className="space-y-4">
            <ReferencePanel className="p-5">
              <h2 className="mb-3 text-lg font-semibold text-[#0f172a]">Daily Summary</h2>
              <Textarea
                value={summary}
                placeholder="No summary yet."
                onChange={(event) => setSummary(event.target.value)}
                className="min-h-[110px] border-[#d9e1ec]"
              />
            </ReferencePanel>

            <ReferencePanel className="p-5">
              <h2 className="mb-3 text-lg font-semibold text-[#0f172a]">Blockers</h2>
              <Textarea
                value={blockers}
                placeholder="No blockers recorded."
                onChange={(event) => setBlockers(event.target.value)}
                className="min-h-[92px] border-[#d9e1ec]"
              />
            </ReferencePanel>

            <ReferencePanel className="p-5">
              <div className="mb-5 grid grid-cols-2 gap-3 text-xs text-[#64748b]">
                <span>Last saved: {formatTimestamp(report.updatedAt)}</span>
                <span>Last submitted: {formatTimestamp(report.submittedAt)}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Button variant="outline" className="h-11 border-[#d9e1ec] text-[#0f172a]" disabled={isBusy} onClick={() => saveReport(false)}>
                  <FilePenLine className="mr-2 h-4 w-4" />
                  Save Draft
                </Button>
                <Button className="h-11 bg-[#2563eb] hover:bg-[#1d4ed8]" disabled={isBusy} onClick={() => saveReport(true)}>
                  <Send className="mr-2 h-4 w-4" />
                  Submit to Review
                </Button>
              </div>
              {message ? <p className="mt-3 text-sm text-[#64748b]">{message}</p> : null}
            </ReferencePanel>

            <ReferencePanel className="p-5">
              <h2 className="mb-4 text-lg font-semibold text-[#0f172a]">Recent Report History</h2>
              <div className="space-y-3">
                {history.length === 0 ? (
                  <EmptyReferenceState>No report history yet.</EmptyReferenceState>
                ) : (
                  history.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 text-sm">
                      <span className="text-[#334155]">{formatReportDate(item.reportDate)}</span>
                      <span className={cn("flex items-center gap-2 font-medium", item.editedAfterDate ? "text-[#ea580c]" : item.status === "SUBMITTED" ? "text-[#16a34a]" : "text-[#64748b]")}>
                        {item.editedAfterDate ? <CircleAlert className="h-4 w-4" /> : item.status === "SUBMITTED" ? <CheckCircle2 className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
                        {item.editedAfterDate ? "Edited after date" : titleCase(item.status)}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <Link href={isPreview ? "/preview/history" : "/history"} className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#2563eb]">
                View full history
                <ChevronRight className="h-4 w-4" />
              </Link>
            </ReferencePanel>
          </aside>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-[#64748b]">
          <LockKeyhole className="h-4 w-4" />
          Reports are viewable by you and your managers.
        </div>
      </main>
    </ReferenceAppShell>
  );
}
