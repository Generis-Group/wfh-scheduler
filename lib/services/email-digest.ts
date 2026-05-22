import type { EmailRun, Prisma } from "@prisma/client";

import { DEFAULT_TIMEZONE, parseReportDate, reportDayEnd } from "@/lib/dates";
import { getOptionalEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { isGenerisEmail } from "@/lib/auth-domain";
import { prisma } from "@/lib/prisma";
import type { ReviewScope } from "@/lib/services/departments";
import { listReportsForDate } from "@/lib/services/reports";

export type ReviewDigestFilters = {
  search?: string;
};

type DigestTrigger = "MANUAL" | "SCHEDULED";

type DigestReport = {
  id: string;
  reportDate?: string | Date;
  status: "DRAFT" | "SUBMITTED";
  workLocation: string;
  blockers: string;
  submittedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  activities: Array<{ selected: boolean; source?: string | null }>;
  revisions: Array<{ createdAt: string | Date }>;
};

type DigestRow = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    role: string;
    status?: string | null;
  };
  report: DigestReport | null;
};

type DigestRecipient = {
  id?: string;
  email: string;
  name?: string | null;
  role?: "REVIEWER" | "ADMIN";
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

function displayName(row: DigestRow) {
  return row.user.name ?? row.user.email ?? "Unassigned employee";
}

function hasBlockers(report: DigestReport | null) {
  return Boolean(report?.blockers?.trim());
}

export function isReportLate(report: DigestReport | null, date: string) {
  const submittedAt = toDate(report?.submittedAt);
  return Boolean(submittedAt && submittedAt > reportDayEnd(report?.reportDate ?? date, DEFAULT_TIMEZONE));
}

export function isReportEditedAfterDate(report: DigestReport | null, date: string) {
  return Boolean(
    report?.revisions.some((revision) => {
      const editedAt = toDate(revision.createdAt);
      return Boolean(editedAt && editedAt > reportDayEnd(report.reportDate ?? date, DEFAULT_TIMEZONE));
    })
  );
}

export function reportDigestStatus(row: DigestRow, date: string) {
  if (!row.report) {
    return "Missing";
  }

  if (isReportEditedAfterDate(row.report, date)) {
    return "Edited After Date";
  }

  if (isReportLate(row.report, date)) {
    return row.report.status === "SUBMITTED" ? "Submitted (Late)" : "Late";
  }

  return row.report.status === "SUBMITTED" ? "Submitted" : "Draft";
}

export function applyReviewDigestFilters(rows: DigestRow[], _date: string, filters: ReviewDigestFilters = {}) {
  const query = filters.search?.trim().toLowerCase() ?? "";

  return rows.filter((row) => {
    const employee = `${row.user.name ?? ""} ${row.user.email ?? ""}`.toLowerCase();
    const matchesSearch = !query || employee.includes(query);

    return matchesSearch && row.user.role === "EMPLOYEE";
  });
}

export function buildReviewDigest({
  date,
  rows,
  recipients,
  appBaseUrl,
  filters = {}
}: {
  date: string;
  rows: DigestRow[];
  recipients: DigestRecipient[];
  appBaseUrl: string;
  filters?: ReviewDigestFilters;
}) {
  const filteredRows = applyReviewDigestFilters(rows, date, filters);
  const submittedRows = filteredRows.filter((row) => row.report?.status === "SUBMITTED");
  const draftRows = filteredRows.filter((row) => row.report?.status === "DRAFT");
  const missingRows = filteredRows.filter((row) => !row.report);
  const blockerRows = filteredRows.filter((row) => hasBlockers(row.report));
  const lateRows = filteredRows.filter((row) => isReportLate(row.report, date));
  const editedRows = filteredRows.filter((row) => isReportEditedAfterDate(row.report, date));
  const expectedCount = filteredRows.length;
  const coverage = expectedCount ? Math.round((submittedRows.length / expectedCount) * 100) : 0;
  const reviewUrl = `${appBaseUrl.replace(/\/$/, "")}/review?date=${encodeURIComponent(date)}`;
  const subject = `Generis daily report digest - ${date}`;
  const filterSummary = [
    filters.search?.trim() ? `search "${filters.search.trim()}"` : null
  ].filter(Boolean).join(", ");

  const textLines = [
    `Generis daily report digest for ${date}`,
    filterSummary ? `Filters: ${filterSummary}` : null,
    `Coverage: ${submittedRows.length}/${expectedCount} submitted (${coverage}%)`,
    `Drafts: ${draftRows.length}`,
    `Missing: ${missingRows.length}`,
    `With blockers: ${blockerRows.length}`,
    `Late: ${lateRows.length}`,
    `Edited after date: ${editedRows.length}`,
    "",
    missingRows.length ? `Missing reports: ${missingRows.map(displayName).join(", ")}` : "Missing reports: none",
    blockerRows.length ? `Reports with blockers: ${blockerRows.map(displayName).join(", ")}` : "Reports with blockers: none",
    lateRows.length || editedRows.length
      ? `Late/edited reports: ${[...new Set([...lateRows, ...editedRows].map(displayName))].join(", ")}`
      : "Late/edited reports: none",
    "",
    `Open review dashboard: ${reviewUrl}`,
    "",
    `Sent to ${recipients.map((recipient) => recipient.email).join(", ")}`
  ].filter((line): line is string => line !== null);

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <h1 style="font-size: 20px; margin: 0 0 8px;">Generis daily report digest</h1>
      <p style="margin: 0 0 16px; color: #475569;">${escapeHtml(date)}${filterSummary ? ` - ${escapeHtml(filterSummary)}` : ""}</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 680px; margin-bottom: 18px;">
        ${metricRow("Coverage", `${submittedRows.length}/${expectedCount} submitted (${coverage}%)`)}
        ${metricRow("Drafts", draftRows.length.toString())}
        ${metricRow("Missing", missingRows.length.toString())}
        ${metricRow("With blockers", blockerRows.length.toString())}
        ${metricRow("Late", lateRows.length.toString())}
        ${metricRow("Edited after date", editedRows.length.toString())}
      </table>
      ${personList("Missing reports", missingRows)}
      ${personList("Reports with blockers", blockerRows)}
      ${personList("Late or edited reports", [...new Map([...lateRows, ...editedRows].map((row) => [row.user.id, row])).values()])}
      <p style="margin-top: 20px;">
        <a href="${escapeAttribute(reviewUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 14px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open review dashboard</a>
      </p>
    </div>
  `;

  return {
    subject,
    html,
    text: textLines.join("\n"),
    counts: {
      expected: expectedCount,
      submitted: submittedRows.length,
      drafts: draftRows.length,
      missing: missingRows.length,
      blockers: blockerRows.length,
      late: lateRows.length,
      edited: editedRows.length
    },
    reviewUrl
  };
}

export async function selectReviewDigestRecipients(scope?: ReviewScope) {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      ...(scope ? { id: scope.userId } : { role: { in: ["REVIEWER", "ADMIN"] as const } }),
      email: { not: null }
    },
    orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true
    }
  });

  return users
    .filter((user): user is { id: string; email: string; name: string | null; role: "REVIEWER" | "ADMIN"; status: "ACTIVE" } =>
      Boolean(
        user.email &&
          isGenerisEmail(user.email) &&
          user.status === "ACTIVE" &&
          (user.role === "REVIEWER" || user.role === "ADMIN")
        )
    )
    .map((user) => ({ id: user.id, email: user.email, name: user.name, role: user.role }));
}

export async function sendReviewDigest({
  date,
  trigger,
  filters,
  scope,
  throwOnFailure = true
}: {
  date: string;
  trigger: DigestTrigger;
  filters?: ReviewDigestFilters;
  scope?: ReviewScope;
  throwOnFailure?: boolean;
}) {
  const reportDate = parseReportDate(date);
  const dedupeKey = trigger === "SCHEDULED" ? `review-digest:${date}:${scope?.userId ?? "global"}` : null;
  let retryRun: EmailRun | null = null;

  if (dedupeKey) {
    const existing = await prisma.emailRun.findUnique({ where: { dedupeKey } });
    if (existing?.status === "SUCCEEDED" || existing?.status === "RUNNING") {
      return { emailRun: existing, skipped: true };
    }
    retryRun = existing;
  }

  const recipients = await selectReviewDigestRecipients(scope);
  const rows = await listReportsForDate(date, scope);
  const appBaseUrl = getOptionalEnv("APP_BASE_URL") ?? getOptionalEnv("NEXTAUTH_URL") ?? "http://localhost:3000";
  const digest = buildReviewDigest({ date, rows, recipients, appBaseUrl, filters });
  const emailRun = retryRun
    ? await prisma.emailRun.update({
        where: { id: retryRun.id },
        data: {
          reportDate,
          trigger,
          status: "RUNNING",
          recipientEmails: recipients.map((recipient) => recipient.email),
          subject: digest.subject,
          providerMessageId: null,
          errorMessage: null,
          completedAt: null,
          filters: filters ? (filters as Prisma.InputJsonValue) : undefined
        }
      })
    : await prisma.emailRun.create({
        data: {
          reportDate,
          trigger,
          status: "RUNNING",
          recipientEmails: recipients.map((recipient) => recipient.email),
          subject: digest.subject,
          filters: filters ? (filters as Prisma.InputJsonValue) : undefined,
          dedupeKey
        }
      });

  if (recipients.length === 0) {
    const skipped = await prisma.emailRun.update({
      where: { id: emailRun.id },
      data: {
        status: "SKIPPED",
        errorMessage: scope ? "The current reviewer/admin recipient does not have an active @generisgp.com email." : "No active reviewer/admin recipients with @generisgp.com emails.",
        completedAt: new Date()
      }
    });

    return { emailRun: skipped, skipped: true };
  }

  try {
    const providerMessageId = await sendResendEmail({
      to: recipients.map((recipient) => recipient.email),
      subject: digest.subject,
      html: digest.html,
      text: digest.text
    });
    const sent = await prisma.emailRun.update({
      where: { id: emailRun.id },
      data: {
        status: "SUCCEEDED",
        providerMessageId,
        completedAt: new Date()
      }
    });

    return { emailRun: sent, skipped: false };
  } catch (error) {
    const failed = await prisma.emailRun.update({
      where: { id: emailRun.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown email error.",
        completedAt: new Date()
      }
    });

    if (!throwOnFailure) {
      return { emailRun: failed, skipped: false };
    }

    throw error;
  }
}

export async function sendScheduledReviewDigests({ date }: { date: string }) {
  const recipients = await selectReviewDigestRecipients();
  const results = [];

  for (const recipient of recipients) {
    results.push(
      await sendReviewDigest({
        date,
        trigger: "SCHEDULED",
        scope: { userId: recipient.id!, role: recipient.role! },
        throwOnFailure: false
      })
    );
  }

  return {
    emailRuns: results.map((result) => result.emailRun),
    skipped: recipients.length === 0 || results.every((result) => result.skipped)
  };
}

export async function getLastReviewDigestRun() {
  return prisma.emailRun.findFirst({
    orderBy: { createdAt: "desc" }
  });
}

export function getReviewDigestEmailStatus() {
  return {
    configured: Boolean(getOptionalEnv("RESEND_API_KEY") && getOptionalEnv("EMAIL_FROM")),
    provider: "Resend",
    from: getOptionalEnv("EMAIL_FROM") ?? null,
    digestTime: `6:00 PM ${DEFAULT_TIMEZONE}`,
    recipientRule: "Manual digests go to the sender; scheduled digests are scoped per active reviewer/admin"
  };
}

async function sendResendEmail({
  to,
  subject,
  html,
  text
}: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = getOptionalEnv("RESEND_API_KEY");
  const from = getOptionalEnv("EMAIL_FROM");

  if (!apiKey || !from) {
    throw new HttpError(500, "Resend email is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text
    })
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body?.message ? `Resend email failed: ${body.message}` : `Resend email failed with status ${response.status}.`);
  }

  return typeof body?.id === "string" ? body.id : null;
}

function metricRow(label: string, value: string) {
  return `
    <tr>
      <td style="border: 1px solid #d8dee8; padding: 8px 10px; color: #475569;">${escapeHtml(label)}</td>
      <td style="border: 1px solid #d8dee8; padding: 8px 10px; font-weight: 700;">${escapeHtml(value)}</td>
    </tr>
  `;
}

function personList(title: string, rows: DigestRow[]) {
  const people = rows.map(displayName);
  const body = people.length
    ? `<ul style="margin: 8px 0 0; padding-left: 18px;">${people.map((person) => `<li>${escapeHtml(person)}</li>`).join("")}</ul>`
    : `<p style="margin: 8px 0 0; color: #64748b;">None</p>`;

  return `
    <section style="margin-top: 16px;">
      <h2 style="font-size: 15px; margin: 0;">${escapeHtml(title)}</h2>
      ${body}
    </section>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}
