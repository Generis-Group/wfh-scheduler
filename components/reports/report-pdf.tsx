"use client";

import type { ReactNode } from "react";

import {
  reportActivitySourceLabel,
  ReportActivitySourceIcon,
} from "@/components/reports/report-ui";
import { cn } from "@/lib/utils";

export type ReportPdfStatusTone =
  | "green"
  | "orange"
  | "blue"
  | "red"
  | "neutral";

export type ReportPdfMetaItem = {
  label: string;
  value: ReactNode;
};

export type ReportPdfActivity = {
  id: string;
  title: string;
  source?: string | null;
  sourceLabel?: string;
  duration: string;
  note?: string | null;
  status?: string | null;
};

function displayActivityStatus(status?: string | null) {
  const trimmed = status?.trim();

  return trimmed && trimmed.toLowerCase() !== "noted" ? trimmed : null;
}

function displayActivityNote(note?: string | null) {
  const trimmed = note?.trim();

  return trimmed && trimmed.toLowerCase() !== "noted" ? trimmed : null;
}

export type ReportPdfComment = {
  id: string;
  body: string;
  meta: string;
};

type ReportPdfDocumentProps = {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  status?: {
    label: string;
    tone?: ReportPdfStatusTone;
  };
  meta: ReportPdfMetaItem[];
  summaryTitle?: string;
  summary: ReactNode;
  activities?: ReportPdfActivity[] | null;
  comments?: ReportPdfComment[];
  backControl?: ReactNode;
  actions?: ReactNode;
  screenExtras?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

const statusToneClassNames: Record<ReportPdfStatusTone, string> = {
  green:
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-300/20",
  orange:
    "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-400/10 dark:text-orange-300 dark:ring-orange-300/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-300/20",
  red: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-300/20",
  neutral:
    "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/[0.06] dark:text-[#cbd5e1] dark:ring-white/10",
};

export function ReportPdfDocument({
  eyebrow = "Daily Report",
  title,
  subtitle,
  status,
  meta,
  summaryTitle = "Summary",
  summary,
  activities = [],
  comments = [],
  backControl,
  actions,
  screenExtras,
  footer,
  className,
}: ReportPdfDocumentProps) {
  const hasReviewNotesPanel = comments.length > 0 || Boolean(screenExtras);
  const showActivitiesSection = activities !== null;
  const activityItems = activities ?? [];
  const hasActivityNotes = activityItems.some(
    (activity) =>
      Boolean(displayActivityNote(activity.note)) ||
      Boolean(displayActivityStatus(activity.status)),
  );

  return (
    <main
      className={cn(
        "reference-page report-pdf-page min-[1120px]:flex min-[1120px]:h-full min-[1120px]:min-h-0 min-[1120px]:flex-col",
        className,
      )}
    >
      <div
        className={cn(
          "report-pdf-wrapper mx-auto min-[1120px]:min-h-0 min-[1120px]:flex-1 min-[1120px]:overflow-y-auto min-[1120px]:overscroll-contain min-[1120px]:pr-1 min-[1120px]:[scrollbar-gutter:stable]",
          hasReviewNotesPanel ? "max-w-[1320px]" : "max-w-[980px]",
        )}
      >
        {backControl ? (
          <div className="report-pdf-back">{backControl}</div>
        ) : null}

        <div
          className={cn(
            "report-pdf-layout grid gap-4",
            hasReviewNotesPanel
              ? "min-[1120px]:grid-cols-[minmax(0,980px)_320px] min-[1120px]:items-start"
              : "",
          )}
        >
          {hasReviewNotesPanel ? (
            <ReportReviewNotesPanel
              comments={comments}
              screenExtras={screenExtras}
              className="report-pdf-screen-only min-[1120px]:sticky min-[1120px]:top-4 min-[1120px]:col-start-2 min-[1120px]:row-start-1"
            />
          ) : null}

          <article
            className={cn(
              "report-pdf-document rounded-[10px] bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.06)] ring-1 ring-[#d9e1ec] dark:bg-[#0f1b2a] dark:ring-[#263a55] min-[760px]:p-6",
              hasReviewNotesPanel
                ? "min-[1120px]:col-start-1 min-[1120px]:row-start-1"
                : "",
            )}
          >
            <div className="report-pdf-header flex flex-col gap-3 border-b border-[#d9e1ec] pb-4 dark:border-[#263a55] min-[760px]:flex-row min-[760px]:items-start min-[760px]:justify-between">
              <div className="min-w-0">
                <p className="report-pdf-eyebrow text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1d4ed8] dark:text-blue-300">
                  {eyebrow}
                </p>
                <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-normal text-[#111827] dark:text-foreground">
                  {title}
                </h1>
                {subtitle ? (
                  <div className="mt-1 text-sm leading-5 text-[#475467] dark:text-muted-foreground">
                    {subtitle}
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2 min-[760px]:justify-end">
                {status ? (
                  <span
                    className={cn(
                      "inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ring-1",
                      statusToneClassNames[status.tone ?? "neutral"],
                    )}
                  >
                    {status.label}
                  </span>
                ) : null}
                {actions ? (
                  <div className="report-pdf-actions">{actions}</div>
                ) : null}
              </div>
            </div>

            <dl className="report-pdf-meta mt-4 grid gap-px overflow-hidden rounded-[8px] ring-1 ring-[#d9e1ec] dark:ring-[#263a55] min-[700px]:grid-cols-4">
              {meta.map((item) => (
                <div
                  key={item.label}
                  className="bg-[#f8fafc] px-3 py-2.5 dark:bg-white/[0.04]"
                >
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#667085] dark:text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-sm font-medium leading-5 text-[#111827] dark:text-foreground">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>

            <ReportPdfSection title={summaryTitle}>
              <div className="report-pdf-prose text-sm leading-6 text-[#111827] dark:text-foreground">
                {summary}
              </div>
            </ReportPdfSection>

            {showActivitiesSection ? (
              <ReportPdfSection
                title="Activities"
                action={
                  activityItems.length ? (
                    <span className="text-xs font-semibold text-[#667085] dark:text-muted-foreground">
                      {activityItems.length} included
                    </span>
                  ) : null
                }
              >
                {activityItems.length ? (
                  <div className="overflow-hidden rounded-[8px] ring-1 ring-[#d9e1ec] dark:ring-[#263a55]">
                    <table className="report-pdf-activity-table w-full text-left text-sm">
                      <thead>
                        <tr className="bg-[#f8fafc] text-[11px] uppercase tracking-[0.08em] text-[#667085] dark:bg-white/[0.04] dark:text-muted-foreground">
                          <th className="px-3 py-2 font-semibold">Activity</th>
                          <th className="hidden w-32 px-3 py-2 font-semibold min-[740px]:table-cell">
                            Source
                          </th>
                          <th className="hidden w-24 px-3 py-2 font-semibold min-[840px]:table-cell">
                            Time
                          </th>
                          {hasActivityNotes ? (
                            <th className="w-28 px-3 py-2 font-semibold whitespace-nowrap">
                              Note
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e5eaf2] dark:divide-[#263a55]">
                        {activityItems.map((activity) => {
                          const activityNote = displayActivityNote(
                            activity.note,
                          );
                          const activityStatus = displayActivityStatus(
                            activity.status,
                          );
                          const activityNoteText =
                            activityNote || activityStatus;

                          return (
                            <tr key={activity.id}>
                              <td className="px-3 py-2.5 align-top">
                                <div className="flex min-w-0 gap-2">
                                  <ReportActivitySourceIcon
                                    source={activity.source}
                                    size="sm"
                                    className="report-pdf-source-icon"
                                  />
                                  <div className="min-w-0">
                                    <div className="font-semibold leading-5 text-[#111827] dark:text-foreground">
                                      {activity.title || "Untitled activity"}
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#667085] dark:text-muted-foreground min-[740px]:hidden">
                                      <span>
                                        {activity.sourceLabel ??
                                          reportActivitySourceLabel(
                                            activity.source,
                                          )}
                                      </span>
                                      <span>{activity.duration}</span>
                                      {activityStatus ? (
                                        <span>{activityStatus}</span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="hidden px-3 py-2.5 align-top text-[#475467] dark:text-muted-foreground min-[740px]:table-cell">
                                {activity.sourceLabel ??
                                  reportActivitySourceLabel(activity.source)}
                              </td>
                              <td className="hidden px-3 py-2.5 align-top font-medium text-[#111827] dark:text-foreground min-[840px]:table-cell">
                                {activity.duration}
                              </td>
                              {hasActivityNotes ? (
                                <td className="min-w-24 px-3 py-2.5 align-top text-[#475467] dark:text-muted-foreground">
                                  {activityNoteText || "-"}
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-[#667085] dark:text-muted-foreground">
                    No activities included.
                  </p>
                )}
              </ReportPdfSection>
            ) : null}

            {footer ? (
              <footer className="report-pdf-footer mt-4 border-t border-[#e5eaf2] pt-3 text-xs text-[#667085] dark:border-[#263a55] dark:text-muted-foreground">
                {footer}
              </footer>
            ) : null}
          </article>
        </div>
      </div>
    </main>
  );
}

function ReportReviewNotesPanel({
  comments,
  screenExtras,
  className,
}: {
  comments: ReportPdfComment[];
  screenExtras?: ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "report-pdf-notes-panel flex flex-col rounded-[10px] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.06)] ring-1 ring-[#d9e1ec] dark:bg-[#0f1b2a] dark:ring-[#263a55]",
        className,
      )}
      aria-label="Review notes"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#111827] dark:text-foreground">
          Review Notes
        </h2>
        {comments.length ? (
          <span className="shrink-0 text-xs font-semibold text-[#667085] dark:text-muted-foreground">
            {comments.length} note{comments.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {comments.length ? (
        <div
          className="report-pdf-comments-list mt-3 min-h-0 space-y-2 pr-1"
          role="region"
          aria-label="Review notes list"
          tabIndex={0}
        >
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded-[8px] bg-[#f8fafc] px-3 py-2.5 ring-1 ring-[#e5eaf2] dark:bg-white/[0.04] dark:ring-[#263a55]"
            >
              <p className="whitespace-pre-wrap text-sm leading-6 text-[#111827] dark:text-foreground">
                {comment.body}
              </p>
              <p className="mt-1 text-xs font-medium text-[#667085] dark:text-muted-foreground">
                {comment.meta}
              </p>
            </div>
          ))}
        </div>
      ) : screenExtras ? (
        <p className="mt-3 text-sm text-[#667085] dark:text-muted-foreground">
          No review notes yet.
        </p>
      ) : null}

      {screenExtras ? (
        <div
          className={cn(
            "report-pdf-screen-extra shrink-0",
            comments.length
              ? "mt-3 border-t border-[#d9e1ec] pt-3 dark:border-[#263a55]"
              : "mt-3",
          )}
        >
          {screenExtras}
        </div>
      ) : null}
    </aside>
  );
}

function ReportPdfSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="report-pdf-card mt-4 rounded-[8px] border border-[#d9e1ec] bg-white p-4 dark:border-[#263a55] dark:bg-[#0f1b2a]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#111827] dark:text-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
