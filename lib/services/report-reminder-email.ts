import { isGenerisEmail } from "@/lib/auth-domain";
import {
  appUrl,
  escapeAttribute,
  escapeHtml,
  trySendEmail,
} from "@/lib/email";
import { parseReportDate } from "@/lib/dates";
import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  getReviewableEmployeeWhere,
  type ReviewScope,
} from "@/lib/services/departments";

type ReminderEmployee = {
  id: string;
  name: string | null;
  email: string | null;
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

function employeeName(employee: ReminderEmployee) {
  return employee.name?.trim() || employee.email || "there";
}

export async function sendReportReminderEmail({
  userId,
  date,
  scope,
}: {
  userId: string;
  date: string;
  scope: ReviewScope;
}) {
  const reportDate = parseReportDate(date);
  const employeeWhere = await getReviewableEmployeeWhere(scope);
  const [employee, report] = await Promise.all([
    prisma.user.findFirst({
      where: {
        ...employeeWhere,
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    }),
    prisma.dailyReport.findUnique({
      where: {
        userId_reportDate: {
          userId,
          reportDate,
        },
      },
      select: {
        status: true,
      },
    }),
  ]);

  if (!employee) {
    throw new HttpError(404, "Employee not found.");
  }

  if (report?.status === "SUBMITTED") {
    throw new HttpError(409, "That report has already been submitted.");
  }

  if (!employee.email || !isGenerisEmail(employee.email)) {
    return {
      employee,
      emailDelivery: {
        status: "SKIPPED" as const,
        reason: "Employee does not have an active Generis email address.",
      },
    };
  }

  const displayDate = formatReportDate(date);
  const dailyReportUrl = appUrl(`/?date=${encodeURIComponent(date)}`);
  const name = employeeName(employee);
  const subject = `Daily report reminder - ${date}`;
  const action =
    report?.status === "DRAFT"
      ? "finish and submit your daily report"
      : "submit your daily report";
  const text = [
    `Hi ${name},`,
    "",
    `This is a reminder to ${action} for ${displayDate}.`,
    "",
    `Open your daily report: ${dailyReportUrl}`,
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <h1 style="font-size: 20px; margin: 0 0 12px;">Daily report reminder</h1>
      <p style="margin: 0 0 14px;">Hi ${escapeHtml(name)},</p>
      <p style="margin: 0 0 20px;">This is a reminder to ${escapeHtml(action)} for <strong>${escapeHtml(displayDate)}</strong>.</p>
      <p style="margin: 0;">
        <a href="${escapeAttribute(dailyReportUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 14px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open daily report</a>
      </p>
    </div>
  `;
  const emailDelivery = await trySendEmail({
    to: employee.email,
    subject,
    html,
    text,
  });

  return { employee, emailDelivery };
}
