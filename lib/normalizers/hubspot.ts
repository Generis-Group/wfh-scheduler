import type {
  HubSpotLoggedHoursConfig,
  HubSpotObjectRecord,
} from "@/lib/integrations/hubspot";
import type { NormalizedActivity } from "@/lib/normalizers/types";

function firstProperty(
  properties: Record<string, string | null | undefined>,
  names: string[],
) {
  for (const name of names) {
    const value = properties[name]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function parseHubSpotDate(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    const epochMillis = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const parsed = new Date(epochMillis);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T12:00:00.000Z`)
    : new Date(trimmed);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDurationText(value: string) {
  const millisecondsMatch = value.match(/(\d+(?:\.\d+)?)\s*ms/i);
  const hoursMatch = value.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/i);
  const minutesMatch = value.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?/i);
  const secondsMatch = value.match(/(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?/i);
  const decimalMatch = value.match(/^\d+(?:\.\d+)?$/);

  if (millisecondsMatch) {
    return Number(millisecondsMatch[1]) / 60_000;
  }

  if (hoursMatch || minutesMatch || secondsMatch) {
    const hours = hoursMatch ? Number(hoursMatch[1]) : 0;
    const minutes = minutesMatch ? Number(minutesMatch[1]) : 0;
    const seconds = secondsMatch ? Number(secondsMatch[1]) : 0;

    return hours * 60 + minutes + seconds / 60;
  }

  return decimalMatch ? Number(decimalMatch[0]) : null;
}

function hasDurationUnitSuffix(value: string) {
  return /(\d+(?:\.\d+)?)\s*(?:ms|h(?:ours?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)\b/i.test(
    value,
  );
}

function parseDurationMinutes(
  value: string | null | undefined,
  unit: HubSpotLoggedHoursConfig["durationUnit"],
) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const textDuration = parseDurationText(trimmed);

  if (textDuration === null || !Number.isFinite(textDuration)) {
    return null;
  }

  if (hasDurationUnitSuffix(trimmed)) {
    return Math.max(0, Math.round(textDuration));
  }

  if (unit === "minutes") {
    return Math.max(0, Math.round(textDuration));
  }

  if (unit === "seconds") {
    return Math.max(0, Math.round(textDuration / 60));
  }

  if (unit === "milliseconds") {
    return Math.max(0, Math.round(textDuration / 60_000));
  }

  return Math.max(0, Math.round(textDuration * 60));
}

function plainText(value: string | null) {
  return (
    value
      ?.replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim() || null
  );
}

function objectTitle(
  properties: Record<string, string | null | undefined>,
  config: HubSpotLoggedHoursConfig,
) {
  const title = plainText(firstProperty(properties, config.titleProperties));

  if (!title) {
    return "HubSpot logged hours";
  }

  return title.length > 90 ? `${title.slice(0, 87).trim()}...` : title;
}

export function normalizeHubSpotLoggedHours(
  record: HubSpotObjectRecord,
  config: HubSpotLoggedHoursConfig,
): NormalizedActivity | null {
  if (!record.id || record.archived) {
    return null;
  }

  const properties = record.properties ?? {};
  const startedAt =
    parseHubSpotDate(properties[config.dateProperty]) ??
    parseHubSpotDate(record.createdAt);
  const durationMinutes = parseDurationMinutes(
    properties[config.durationProperty],
    config.durationUnit,
  );

  if (!startedAt || !durationMinutes) {
    return null;
  }

  const title = objectTitle(properties, config);
  const sourceUrl = config.sourceUrlProperty
    ? properties[config.sourceUrlProperty]?.trim() || null
    : null;
  const status = config.statusProperty
    ? properties[config.statusProperty]?.trim() || null
    : null;
  const description = plainText(
    firstProperty(properties, config.descriptionProperties),
  );

  return {
    source: "HUBSPOT",
    sourceId: `logged-hours:${config.objectType}:${record.id}`,
    sourceContainerId: config.objectType,
    title,
    description,
    status,
    sourceUrl,
    startedAt,
    endedAt: new Date(startedAt.getTime() + durationMinutes * 60_000),
    durationMinutes,
    metadata: {
      hubSpotObjectType: config.objectType,
      hubSpotObjectId: record.id,
      dateProperty: config.dateProperty,
      durationProperty: config.durationProperty,
      userEmailProperty: config.userEmailProperty,
      importedKind: "logged_hours",
    },
  };
}
