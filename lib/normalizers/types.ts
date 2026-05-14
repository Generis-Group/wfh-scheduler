import type { ActivitySource } from "@prisma/client";

export type NormalizedActivity = {
  source: ActivitySource;
  sourceId: string;
  sourceContainerId?: string | null;
  title: string;
  description?: string | null;
  status?: string | null;
  sourceUrl?: string | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  durationMinutes?: number | null;
  metadata?: Record<string, unknown>;
};
