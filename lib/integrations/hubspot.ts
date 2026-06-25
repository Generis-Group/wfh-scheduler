import { getOptionalEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";

export type HubSpotLoggedHoursConfig = {
  apiBaseUrl: string;
  crmApiVersion: string;
  token: string;
  objectType: string;
  dateProperty: string;
  durationProperty: string;
  durationUnit: "hours" | "minutes" | "seconds" | "milliseconds";
  userEmailProperty: string;
  userMatchMode: "emailProperty" | "ownerEmail";
  titleProperties: string[];
  descriptionProperties: string[];
  statusProperty?: string;
  sourceUrlProperty?: string;
  pageLimit: number;
  dateFilterFormat: "epochMillis" | "iso" | "date";
};

export type HubSpotObjectRecord = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
  properties?: Record<string, string | null | undefined>;
};

type HubSpotSearchResponse = {
  results?: HubSpotObjectRecord[];
  paging?: {
    next?: {
      after?: string;
    };
  };
};

type HubSpotOwnersResponse = {
  results?: Array<{
    id?: string;
    email?: string | null;
    archived?: boolean;
  }>;
};

type HubSpotSearchFilter = {
  propertyName: string;
  operator: "EQ" | "GTE" | "LT";
  value: string;
};

type HubSpotSearchBody = {
  filterGroups: Array<{ filters: HubSpotSearchFilter[] }>;
  properties: string[];
  limit: number;
  after?: string;
};

function commaSeparatedEnv(name: string, fallback: string[] = []) {
  const value = getOptionalEnv(name);

  if (!value) {
    return fallback;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function configuredDurationUnit(): HubSpotLoggedHoursConfig["durationUnit"] {
  const value = getOptionalEnv("HUBSPOT_LOGGED_HOURS_DURATION_UNIT");

  if (!value) {
    return "hours";
  }

  if (
    value === "hours" ||
    value === "minutes" ||
    value === "seconds" ||
    value === "milliseconds"
  ) {
    return value;
  }

  throw new HttpError(
    409,
    "HubSpot logged-hours import is misconfigured. HUBSPOT_LOGGED_HOURS_DURATION_UNIT must be hours, minutes, seconds, or milliseconds.",
  );
}

function configuredUserMatchMode(): HubSpotLoggedHoursConfig["userMatchMode"] {
  const value = getOptionalEnv("HUBSPOT_LOGGED_HOURS_USER_MATCH_MODE");

  if (!value) {
    return "emailProperty";
  }

  if (value === "emailProperty" || value === "ownerEmail") {
    return value;
  }

  throw new HttpError(
    409,
    "HubSpot logged-hours import is misconfigured. HUBSPOT_LOGGED_HOURS_USER_MATCH_MODE must be emailProperty or ownerEmail.",
  );
}

function configuredDateFilterFormat(): HubSpotLoggedHoursConfig["dateFilterFormat"] {
  const value = getOptionalEnv("HUBSPOT_LOGGED_HOURS_DATE_FILTER_FORMAT");

  if (!value) {
    return "epochMillis";
  }

  if (value === "epochMillis" || value === "iso" || value === "date") {
    return value;
  }

  throw new HttpError(
    409,
    "HubSpot logged-hours import is misconfigured. HUBSPOT_LOGGED_HOURS_DATE_FILTER_FORMAT must be epochMillis, iso, or date.",
  );
}

function configuredPageLimit() {
  const value = Number(getOptionalEnv("HUBSPOT_LOGGED_HOURS_PAGE_LIMIT") ?? 100);

  if (!Number.isFinite(value) || value < 1) {
    return 100;
  }

  return Math.min(100, Math.floor(value));
}

export function getHubSpotLoggedHoursConfig(): HubSpotLoggedHoursConfig {
  const required = {
    HUBSPOT_PRIVATE_APP_TOKEN: getOptionalEnv("HUBSPOT_PRIVATE_APP_TOKEN"),
    HUBSPOT_LOGGED_HOURS_OBJECT_TYPE: getOptionalEnv(
      "HUBSPOT_LOGGED_HOURS_OBJECT_TYPE",
    ),
    HUBSPOT_LOGGED_HOURS_DATE_PROPERTY: getOptionalEnv(
      "HUBSPOT_LOGGED_HOURS_DATE_PROPERTY",
    ),
    HUBSPOT_LOGGED_HOURS_DURATION_PROPERTY: getOptionalEnv(
      "HUBSPOT_LOGGED_HOURS_DURATION_PROPERTY",
    ),
    HUBSPOT_LOGGED_HOURS_USER_EMAIL_PROPERTY: getOptionalEnv(
      "HUBSPOT_LOGGED_HOURS_USER_EMAIL_PROPERTY",
    ),
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new HttpError(
      409,
      `HubSpot logged-hours import is not configured. Ask an admin to set ${missing.join(", ")}.`,
    );
  }

  return {
    apiBaseUrl:
      getOptionalEnv("HUBSPOT_API_BASE_URL") ?? "https://api.hubapi.com",
    crmApiVersion: getOptionalEnv("HUBSPOT_CRM_API_VERSION") ?? "2026-03",
    token: required.HUBSPOT_PRIVATE_APP_TOKEN!,
    objectType: required.HUBSPOT_LOGGED_HOURS_OBJECT_TYPE!,
    dateProperty: required.HUBSPOT_LOGGED_HOURS_DATE_PROPERTY!,
    durationProperty: required.HUBSPOT_LOGGED_HOURS_DURATION_PROPERTY!,
    durationUnit: configuredDurationUnit(),
    userEmailProperty: required.HUBSPOT_LOGGED_HOURS_USER_EMAIL_PROPERTY!,
    userMatchMode: configuredUserMatchMode(),
    titleProperties: commaSeparatedEnv("HUBSPOT_LOGGED_HOURS_TITLE_PROPERTIES", [
      "task_name",
      "project_name",
      "name",
      "title",
      "subject",
    ]),
    descriptionProperties: commaSeparatedEnv(
      "HUBSPOT_LOGGED_HOURS_DESCRIPTION_PROPERTIES",
      ["description", "notes", "comment"],
    ),
    statusProperty: getOptionalEnv("HUBSPOT_LOGGED_HOURS_STATUS_PROPERTY"),
    sourceUrlProperty: getOptionalEnv("HUBSPOT_LOGGED_HOURS_URL_PROPERTY"),
    pageLimit: configuredPageLimit(),
    dateFilterFormat: configuredDateFilterFormat(),
  };
}

function hubSpotDateFilterValue(
  date: Date,
  format: HubSpotLoggedHoursConfig["dateFilterFormat"],
) {
  if (format === "iso") {
    return date.toISOString();
  }

  if (format === "date") {
    return date.toISOString().slice(0, 10);
  }

  return String(date.getTime());
}

function hubSpotSearchPath(config: HubSpotLoggedHoursConfig) {
  return `/crm/objects/${encodeURIComponent(config.crmApiVersion)}/${encodeURIComponent(config.objectType)}/search`;
}

function hubSpotApiError(response: Response, body: string) {
  if (response.status === 401 || response.status === 403) {
    return new HttpError(
      409,
      "HubSpot logged-hours import needs access to the configured HubSpot data. Ask an admin to check the private app permissions.",
    );
  }

  if (response.status === 400) {
    return new HttpError(
      409,
      "HubSpot rejected the logged-hours search. Ask an admin to check the configured HubSpot object and property mappings.",
    );
  }

  return new HttpError(
    502,
    `HubSpot request failed: ${body || response.statusText}`,
  );
}

async function hubSpotRequest<T>(
  config: HubSpotLoggedHoursConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw hubSpotApiError(response, await response.text());
  }

  return response.json() as Promise<T>;
}

function loggedHoursProperties(config: HubSpotLoggedHoursConfig) {
  return [
    config.dateProperty,
    config.durationProperty,
    config.userEmailProperty,
    config.statusProperty,
    config.sourceUrlProperty,
    ...config.titleProperties,
    ...config.descriptionProperties,
  ].filter((property): property is string => Boolean(property));
}

async function hubSpotOwnerIdForEmail(
  config: HubSpotLoggedHoursConfig,
  userEmail: string,
) {
  const response = await hubSpotRequest<HubSpotOwnersResponse>(
    config,
    `/crm/v3/owners?email=${encodeURIComponent(userEmail)}&archived=false`,
  );
  const owner = response.results?.find(
    (item) =>
      item.id &&
      !item.archived &&
      item.email?.toLowerCase() === userEmail.toLowerCase(),
  );

  if (!owner?.id) {
    throw new HttpError(
      409,
      `No active HubSpot owner matches ${userEmail}. Ask an admin to confirm this reporting user exists as a HubSpot owner.`,
    );
  }

  return owner.id;
}

async function hubSpotUserFilterValue(
  config: HubSpotLoggedHoursConfig,
  userEmail: string,
) {
  if (config.userMatchMode === "ownerEmail") {
    return hubSpotOwnerIdForEmail(config, userEmail);
  }

  return userEmail;
}

export async function searchHubSpotLoggedHours(
  config: HubSpotLoggedHoursConfig,
  userEmail: string,
  start: Date,
  end: Date,
) {
  const email = userEmail.trim().toLowerCase();
  const userFilterValue = await hubSpotUserFilterValue(config, email);
  const filters: HubSpotSearchFilter[] = [
    {
      propertyName: config.userEmailProperty,
      operator: "EQ",
      value: userFilterValue,
    },
    {
      propertyName: config.dateProperty,
      operator: "GTE",
      value: hubSpotDateFilterValue(start, config.dateFilterFormat),
    },
    {
      propertyName: config.dateProperty,
      operator: "LT",
      value: hubSpotDateFilterValue(end, config.dateFilterFormat),
    },
  ];
  const records: HubSpotObjectRecord[] = [];
  let after: string | undefined;

  do {
    const body: HubSpotSearchBody = {
      filterGroups: [{ filters }],
      properties: [...new Set(loggedHoursProperties(config))],
      limit: config.pageLimit,
      after,
    };
    const response = await hubSpotRequest<HubSpotSearchResponse>(
      config,
      hubSpotSearchPath(config),
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );

    records.push(...(response.results ?? []));
    after = response.paging?.next?.after;
  } while (after);

  return records;
}
