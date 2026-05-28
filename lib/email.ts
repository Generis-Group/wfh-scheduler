import { getOptionalEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";

export type EmailDelivery =
  | {
      status: "SENT";
      providerMessageId: string | null;
    }
  | {
      status: "SKIPPED";
      reason: string;
    }
  | {
      status: "FAILED";
      error: string;
    };

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
};

export function appBaseUrl() {
  return (
    getOptionalEnv("APP_BASE_URL") ??
    getOptionalEnv("NEXTAUTH_URL") ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function appUrl(path = "/") {
  return `${appBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getEmailStatus() {
  const apiKey = getOptionalEnv("RESEND_API_KEY");
  const from = getOptionalEnv("EMAIL_FROM");

  return {
    configured: Boolean(apiKey && from),
    provider: "Resend",
    from: from ?? null,
  };
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailInput) {
  const apiKey = getOptionalEnv("RESEND_API_KEY");
  const from = getOptionalEnv("EMAIL_FROM");

  if (!apiKey || !from) {
    throw new HttpError(500, "Resend email is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    }),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      body?.message
        ? `Resend email failed: ${body.message}`
        : `Resend email failed with status ${response.status}.`,
    );
  }

  return typeof body?.id === "string" ? body.id : null;
}

export async function trySendEmail(input: SendEmailInput): Promise<EmailDelivery> {
  if (!getEmailStatus().configured) {
    return {
      status: "SKIPPED",
      reason: "Resend email is not configured.",
    };
  }

  try {
    const providerMessageId = await sendEmail(input);

    return {
      status: "SENT",
      providerMessageId,
    };
  } catch (error) {
    return {
      status: "FAILED",
      error: error instanceof Error ? error.message : "Unknown email error.",
    };
  }
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttribute(value: string) {
  return escapeHtml(value);
}
