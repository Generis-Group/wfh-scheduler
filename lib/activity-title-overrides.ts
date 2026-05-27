import type { Prisma } from "@prisma/client";

import type { NormalizedActivity } from "@/lib/normalizers/types";

const remoteTitleKey = "generisRemoteTitle";
const localTitleOverrideKey = "generisLocalTitleOverride";

function metadataObject(value?: NormalizedActivity["metadata"] | Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

function metadataJson(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function hasLocalActivityTitleOverride(
  metadata?: Prisma.JsonValue | null,
) {
  return metadataObject(metadata)[localTitleOverrideKey] === true;
}

export function importedActivityTitle(
  remoteTitle: string,
  existing?: { title: string; metadata: Prisma.JsonValue | null } | null,
) {
  return existing && hasLocalActivityTitleOverride(existing.metadata)
    ? existing.title
    : remoteTitle;
}

export function importedActivityMetadata(
  metadata: NormalizedActivity["metadata"],
  remoteTitle: string,
  existing?: { metadata: Prisma.JsonValue | null } | null,
) {
  const nextMetadata = metadataObject(metadata);
  nextMetadata[remoteTitleKey] = remoteTitle;

  if (existing && hasLocalActivityTitleOverride(existing.metadata)) {
    nextMetadata[localTitleOverrideKey] = true;
  }

  return metadataJson(nextMetadata);
}

export function activityMetadataWithLocalTitleState(
  metadata: Prisma.JsonValue | null,
  title: string,
) {
  const nextMetadata = metadataObject(metadata);
  const remoteTitle = nextMetadata[remoteTitleKey];

  if (typeof remoteTitle === "string" && title.trim() === remoteTitle.trim()) {
    delete nextMetadata[localTitleOverrideKey];
  } else {
    nextMetadata[localTitleOverrideKey] = true;
  }

  return metadataJson(nextMetadata);
}
