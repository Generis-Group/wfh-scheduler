import { formatInTimeZone } from "date-fns-tz";

import { DEFAULT_TIMEZONE, todayDateString } from "@/lib/dates";
import { getOptionalEnv } from "@/lib/env";
import { handleRouteError, HttpError, json } from "@/lib/http";
import { sendScheduledReviewDigests } from "@/lib/services/email-digest";

function isAuthorized(request: Request) {
  const secret = getOptionalEnv("CRON_SECRET");

  if (!secret) {
    throw new HttpError(500, "CRON_SECRET is not configured.");
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function cronWindow(now = new Date()) {
  const weekday = Number(formatInTimeZone(now, DEFAULT_TIMEZONE, "i"));

  return {
    isWeekday: weekday >= 1 && weekday <= 5
  };
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      throw new HttpError(401, "Invalid cron secret.");
    }

    const window = cronWindow();

    if (!window.isWeekday) {
      return json({ skipped: true, reason: "Daily digest runs Monday-Friday." });
    }

    const date = todayDateString(DEFAULT_TIMEZONE);
    const result = await sendScheduledReviewDigests({ date });

    return json({
      emailRuns: result.emailRuns,
      skipped: result.skipped
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const dynamic = "force-dynamic";
