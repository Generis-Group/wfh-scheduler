import { isGenerisEmail } from "@/lib/auth-domain";
import {
  appUrl,
  escapeAttribute,
  escapeHtml,
  trySendEmail,
  type EmailDelivery,
} from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { hasUserRole } from "@/lib/roles";

type BugReportEmailReport = {
  id: string;
  body: string;
  pagePath?: string | null;
  userAgent?: string | null;
  createdAt?: string | Date | null;
  reporter?: {
    name?: string | null;
    email?: string | null;
  } | null;
  attachments?: Array<unknown> | null;
};

type BugReportAdminRecipient = {
  email: string;
  name?: string | null;
};

export async function selectBugReportAdminRecipients(): Promise<
  BugReportAdminRecipient[]
> {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      email: { not: null },
      OR: [{ roles: { has: "ADMIN" as const } }, { role: "ADMIN" as const }],
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      roles: true,
      status: true,
    },
  });

  return users
    .filter(
      (user): user is typeof user & { email: string } =>
        Boolean(
          user.email &&
            isGenerisEmail(user.email) &&
            user.status === "ACTIVE" &&
            hasUserRole(user, "ADMIN"),
        ),
    )
    .map((user) => ({
      email: user.email,
      name: user.name,
    }));
}

export async function sendBugReportAdminEmail(
  report: BugReportEmailReport,
): Promise<EmailDelivery> {
  const recipients = await selectBugReportAdminRecipients();

  if (recipients.length === 0) {
    return {
      status: "SKIPPED",
      reason: "No active admin recipients with @generisgp.com emails.",
    };
  }

  const reporter = displayName(report.reporter, "Someone");
  const reportUrl = appUrl(`/bugs?reportId=${encodeURIComponent(report.id)}`);
  const pagePath = report.pagePath?.trim() || "Unknown page";
  const attachmentCount = report.attachments?.length ?? 0;
  const subject = `New bug report from ${reporter}`;
  const text = [
    `New bug report from ${reporter}`,
    report.reporter?.email ? `Reporter email: ${report.reporter.email}` : null,
    `Page: ${pagePath}`,
    `Screenshots: ${attachmentCount}`,
    "",
    report.body.trim(),
    "",
    `Open bug report: ${reportUrl}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <h1 style="font-size: 20px; margin: 0 0 12px;">New bug report</h1>
      <p style="margin: 0 0 14px;"><strong>${escapeHtml(reporter)}</strong> submitted a bug report.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 640px; margin: 0 0 18px;">
        ${detailRow("Reporter email", report.reporter?.email ?? "Unknown")}
        ${detailRow("Page", pagePath)}
        ${detailRow("Screenshots", attachmentCount.toString())}
      </table>
      <blockquote style="margin: 0 0 20px; padding: 12px 14px; border-left: 3px solid #2563eb; background: #f8fafc; color: #334155;">${escapeHtml(report.body.trim())}</blockquote>
      <p style="margin: 0;">
        <a href="${escapeAttribute(reportUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 14px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open bug report</a>
      </p>
    </div>
  `;

  return trySendEmail({
    to: recipients.map((recipient) => recipient.email),
    subject,
    html,
    text,
  });
}

function displayName(
  person?: { name?: string | null; email?: string | null } | null,
  fallback = "Unknown",
) {
  return person?.name?.trim() || person?.email || fallback;
}

function detailRow(label: string, value: string) {
  return `
    <tr>
      <td style="border: 1px solid #d8dee8; padding: 8px 10px; color: #475569;">${escapeHtml(label)}</td>
      <td style="border: 1px solid #d8dee8; padding: 8px 10px; font-weight: 700;">${escapeHtml(value)}</td>
    </tr>
  `;
}
