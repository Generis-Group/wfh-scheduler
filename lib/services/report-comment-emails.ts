import { isGenerisEmail } from "@/lib/auth-domain";
import {
  appUrl,
  escapeAttribute,
  escapeHtml,
  trySendEmail,
} from "@/lib/email";
import { parseReportDate, reportDateKey } from "@/lib/dates";

type CommentEmailReport = {
  id: string;
  reportDate?: string | Date | null;
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

type CommentEmailAuthor = {
  name?: string | null;
  email?: string | null;
};

function formatReportDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseReportDate(date));
}

function displayName(person?: CommentEmailAuthor | null, fallback = "there") {
  return person?.name?.trim() || person?.email || fallback;
}

export async function sendReportCommentEmail({
  report,
  commentBody,
  author,
}: {
  report: CommentEmailReport;
  commentBody: string;
  author: CommentEmailAuthor;
}) {
  const trimmedBody = commentBody.trim();

  if (!trimmedBody || trimmedBody.toLowerCase() === "reviewed") {
    return {
      status: "SKIPPED" as const,
      reason: "No employee notification is needed for this comment.",
    };
  }

  const employeeEmail = report.user?.email;

  if (!employeeEmail || !isGenerisEmail(employeeEmail)) {
    return {
      status: "SKIPPED" as const,
      reason: "Employee does not have an active Generis email address.",
    };
  }

  const reportDate = reportDateKey(report.reportDate ?? new Date());
  const displayDate = formatReportDate(reportDate);
  const reportUrl = appUrl(`/?date=${encodeURIComponent(reportDate)}`);
  const employeeName = displayName(report.user);
  const authorName = displayName(author, "A reviewer");
  const subject = `New report comment - ${reportDate}`;
  const text = [
    `Hi ${employeeName},`,
    "",
    `${authorName} left a comment on your daily report for ${displayDate}:`,
    "",
    trimmedBody,
    "",
    `Open report: ${reportUrl}`,
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <h1 style="font-size: 20px; margin: 0 0 12px;">New report comment</h1>
      <p style="margin: 0 0 14px;">Hi ${escapeHtml(employeeName)},</p>
      <p style="margin: 0 0 14px;">${escapeHtml(authorName)} left a comment on your daily report for <strong>${escapeHtml(displayDate)}</strong>.</p>
      <blockquote style="margin: 0 0 20px; padding: 12px 14px; border-left: 3px solid #2563eb; background: #f8fafc; color: #334155;">${escapeHtml(trimmedBody)}</blockquote>
      <p style="margin: 0;">
        <a href="${escapeAttribute(reportUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 14px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open report</a>
      </p>
    </div>
  `;

  return trySendEmail({
    to: employeeEmail,
    subject,
    html,
    text,
  });
}
