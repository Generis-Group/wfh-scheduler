export const workLocationValues = [
  "OFFICE",
  "WFH",
  "HYBRID",
  "OFFICE_AM_WFH_PM",
  "WFH_AM_OFFICE_PM",
  "PTO",
  "OUT_OF_OFFICE",
  "UNKNOWN",
] as const;

export type WorkLocationValue = (typeof workLocationValues)[number];

export const realWorkLocationValues = [
  "OFFICE",
  "WFH",
  "HYBRID",
  "OFFICE_AM_WFH_PM",
  "WFH_AM_OFFICE_PM",
  "OUT_OF_OFFICE",
] as const;

export const plannedWorkLocationValues = [
  "OFFICE",
  "WFH",
  "OFFICE_AM_WFH_PM",
  "WFH_AM_OFFICE_PM",
  "OUT_OF_OFFICE",
] as const;

export const dailyWorkLocationValues = [
  "UNKNOWN",
  ...plannedWorkLocationValues,
] as const;

export type PlannedWorkLocationValue =
  (typeof plannedWorkLocationValues)[number];

export function normalizeWorkLocationValue(
  value?: string | null,
): WorkLocationValue | null {
  if (value === "PTO") {
    return "OUT_OF_OFFICE";
  }

  return workLocationValues.includes(value as WorkLocationValue)
    ? (value as WorkLocationValue)
    : null;
}

export function normalizePlannedWorkLocationValue(
  value?: string | null,
): PlannedWorkLocationValue | null {
  const normalized = normalizeWorkLocationValue(value);

  return plannedWorkLocationValues.includes(
    normalized as PlannedWorkLocationValue,
  )
    ? (normalized as PlannedWorkLocationValue)
    : null;
}

const workLocationLabels: Record<WorkLocationValue, string> = {
  OFFICE: "Office",
  WFH: "WFH",
  HYBRID: "Hybrid",
  OFFICE_AM_WFH_PM: "Office AM / WFH PM",
  WFH_AM_OFFICE_PM: "WFH AM / Office PM",
  PTO: "Out of office",
  OUT_OF_OFFICE: "Out of office",
  UNKNOWN: "Unspecified",
};

export function workLocationLabel(value?: string | null) {
  const normalized = normalizeWorkLocationValue(value);

  return normalized ? workLocationLabels[normalized] : "Unspecified";
}

export function isWorkLocationValue(
  value?: string | null,
): value is WorkLocationValue {
  return workLocationValues.includes(value as WorkLocationValue);
}

export function isRealWorkLocation(value?: string | null) {
  const normalized = normalizeWorkLocationValue(value);

  return realWorkLocationValues.includes(
    normalized as (typeof realWorkLocationValues)[number],
  );
}

export function isPlannedWorkLocation(value?: string | null) {
  return plannedWorkLocationValues.includes(value as PlannedWorkLocationValue);
}

export function wfhDayFraction(value?: string | null) {
  if (value === "WFH") {
    return 1;
  }

  if (
    value === "HYBRID" ||
    value === "OFFICE_AM_WFH_PM" ||
    value === "WFH_AM_OFFICE_PM"
  ) {
    return 0.5;
  }

  return 0;
}
