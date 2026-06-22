import { isRealWorkLocation } from "@/lib/work-locations";

const submittableNonWorkLocations = new Set(["PTO", "OUT_OF_OFFICE"]);

export const emptyReportSubmitMessage =
  "Add work items, a summary, or choose PTO/out of office before submitting.";

export const missingWorkLocationSubmitMessage =
  "Choose where you are working before submitting.";

export function hasRequiredWorkLocation(workLocation?: string | null) {
  return isRealWorkLocation(workLocation);
}

export function hasSubmitReadyContent({
  summary,
  workLocation,
  activities = [],
  manualActivities = [],
}: {
  summary?: string | null;
  workLocation?: string | null;
  activities?: Array<{ selected?: boolean | null }>;
  manualActivities?: Array<unknown>;
}) {
  return Boolean(
    summary?.trim() ||
    submittableNonWorkLocations.has(workLocation ?? "") ||
    activities.some((activity) => activity.selected !== false) ||
    manualActivities.length > 0,
  );
}
