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
  "PTO",
  "OUT_OF_OFFICE",
] as const;

export const plannedWorkLocationValues = [
  "OFFICE",
  "WFH",
  "OFFICE_AM_WFH_PM",
  "WFH_AM_OFFICE_PM",
  "PTO",
  "OUT_OF_OFFICE",
] as const;

export const dailyWorkLocationValues = [
  "UNKNOWN",
  ...plannedWorkLocationValues,
] as const;

export type PlannedWorkLocationValue =
  (typeof plannedWorkLocationValues)[number];

const workLocationLabels: Record<WorkLocationValue, string> = {
  OFFICE: "Office",
  WFH: "WFH",
  HYBRID: "Hybrid",
  OFFICE_AM_WFH_PM: "Office AM / WFH PM",
  WFH_AM_OFFICE_PM: "WFH AM / Office PM",
  PTO: "PTO",
  OUT_OF_OFFICE: "Out of office",
  UNKNOWN: "Unspecified",
};

export function workLocationLabel(value?: string | null) {
  return workLocationLabels[value as WorkLocationValue] ?? "Unspecified";
}

export function isWorkLocationValue(
  value?: string | null,
): value is WorkLocationValue {
  return workLocationValues.includes(value as WorkLocationValue);
}

export function isRealWorkLocation(value?: string | null) {
  return realWorkLocationValues.includes(
    value as (typeof realWorkLocationValues)[number],
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
