import type { Prisma } from "@prisma/client";

export type ActivitySourceLink = {
  href: string;
  label: string;
  source?: string | null;
};

const relatedActivityIdKey = "relatedActivityId";
const relatedSourceLinksKey = "relatedSourceLinks";

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizedHref(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed === "#") {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.hash = url.hash || "";

    return url.toString();
  } catch {
    return null;
  }
}

export function activitySourceLabel(source?: string | null) {
  if (source === "JIRA") {
    return "Jira";
  }

  if (source === "GOOGLE_CALENDAR") {
    return "Google Calendar";
  }

  if (source === "GOOGLE_TASKS") {
    return "Google Task";
  }

  if (source === "GMAIL") {
    return "Gmail thread";
  }

  if (source === "GOOGLE_CHAT") {
    return "Google Chat";
  }

  if (source === "HUBSPOT") {
    return "HubSpot";
  }

  if (source === "MANUAL") {
    return "Manual item";
  }

  return "Source";
}

function normalizedLink(
  link:
    | {
        href?: string | null;
        label?: string | null;
        source?: string | null;
      }
    | null
    | undefined,
): ActivitySourceLink | null {
  const href = normalizedHref(link?.href);

  if (!href) {
    return null;
  }

  const source = typeof link?.source === "string" ? link.source : null;
  const label =
    typeof link?.label === "string" && link.label.trim()
      ? link.label.trim()
      : activitySourceLabel(source);

  return { href, label, source };
}

export function sourceLinkForActivity(activity: {
  source?: string | null;
  sourceUrl?: string | null;
}) {
  return normalizedLink({
    href: activity.sourceUrl,
    label: activitySourceLabel(activity.source),
    source: activity.source,
  });
}

export function relatedActivityIdFromMetadata(metadata: unknown) {
  const value = metadataRecord(metadata)?.[relatedActivityIdKey];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function relatedSourceLinksFromMetadata(metadata: unknown) {
  const links = metadataRecord(metadata)?.[relatedSourceLinksKey];

  if (!Array.isArray(links)) {
    return [];
  }

  return links
    .map((link) => {
      const record = metadataRecord(link);

      return record
        ? normalizedLink({
            href: typeof record.href === "string" ? record.href : null,
            label: typeof record.label === "string" ? record.label : null,
            source: typeof record.source === "string" ? record.source : null,
          })
        : null;
    })
    .filter((link): link is ActivitySourceLink => Boolean(link));
}

export function uniqueActivitySourceLinks(
  links: Array<Partial<ActivitySourceLink> | null | undefined>,
) {
  const seen = new Set<string>();
  const unique: ActivitySourceLink[] = [];

  for (const rawLink of links) {
    const link = normalizedLink(rawLink);

    if (!link || seen.has(link.href)) {
      continue;
    }

    seen.add(link.href);
    unique.push(link);
  }

  return unique;
}

export function activitySourceLinks(activity: {
  source?: string | null;
  sourceUrl?: string | null;
  metadata?: Prisma.JsonValue | null;
}) {
  return uniqueActivitySourceLinks([
    sourceLinkForActivity(activity),
    ...relatedSourceLinksFromMetadata(activity.metadata),
  ]);
}

export function activitySourceLinkOptions(activity: {
  source?: string | null;
  sourceUrl?: string | null;
  sourceLinks?: Array<Partial<ActivitySourceLink> | null | undefined> | null;
}) {
  return uniqueActivitySourceLinks([
    ...(activity.sourceLinks ?? []),
    sourceLinkForActivity(activity),
  ]);
}

export function metadataWithRelatedSourceLinks(
  metadata: Prisma.JsonValue | null | undefined,
  links: Array<Partial<ActivitySourceLink> | null | undefined>,
) {
  const existing = metadataRecord(metadata);
  const record = existing ? { ...existing } : {};
  const nextLinks = uniqueActivitySourceLinks([
    ...relatedSourceLinksFromMetadata(record),
    ...links,
  ]);

  if (nextLinks.length === 0) {
    return record as Prisma.InputJsonValue;
  }

  record[relatedSourceLinksKey] = nextLinks;

  return record as Prisma.InputJsonValue;
}

export function metadataWithRelatedActivity(
  metadata: Record<string, unknown> | undefined,
  relatedActivityId: string,
  links: Array<Partial<ActivitySourceLink> | null | undefined>,
) {
  return {
    ...(metadata ?? {}),
    [relatedActivityIdKey]: relatedActivityId,
    [relatedSourceLinksKey]: uniqueActivitySourceLinks(links),
  };
}
