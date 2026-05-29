export const summaryActivityReferenceDragType =
  "application/x-generis-activity-reference";

export type SummaryActivityReferenceDragPayload = {
  activityId?: string;
  source?: string | null;
  title: string;
  url?: string | null;
};
