import type { calendar_v3 } from "googleapis";

import type { NormalizedActivity } from "@/lib/normalizers/types";

function attendeeResponse(event: calendar_v3.Schema$Event, userEmail?: string | null) {
  const attendee = event.attendees?.find(
    (item) =>
      item.self ||
      (userEmail &&
        item.email?.toLowerCase() === userEmail.toLowerCase()),
  );

  if (attendee?.responseStatus) {
    return attendee.responseStatus;
  }

  return undefined;
}

export function normalizeCalendarEvent(
  event: calendar_v3.Schema$Event,
  userEmail?: string | null
): NormalizedActivity | null {
  if (!event.id || event.status === "cancelled") {
    return null;
  }

  const startsAt = event.start?.dateTime;
  const endsAt = event.end?.dateTime;

  if (!startsAt || !endsAt) {
    return null;
  }

  const response = attendeeResponse(event, userEmail);

  if (response !== "accepted") {
    return null;
  }

  const startedAt = new Date(startsAt);
  const endedAt = new Date(endsAt);
  const durationMinutes = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000));
  const attendeeCount = event.attendees?.length ?? 0;

  return {
    source: "GOOGLE_CALENDAR",
    sourceId: event.id,
    sourceContainerId: event.organizer?.email ?? null,
    title: event.summary ?? "Untitled meeting",
    description: event.location ?? null,
    status: response ?? event.status ?? null,
    sourceUrl: event.htmlLink ?? null,
    startedAt,
    endedAt,
    durationMinutes,
    metadata: {
      attendeeCount,
      response,
      meetingType: attendeeCount > 2 ? "group" : "one_on_one",
      hangoutLink: event.hangoutLink
    }
  };
}
