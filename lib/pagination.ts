export const paginationPageSizeOptions = [5, 10, 25, 50, 100] as const;
export const defaultPaginationPageSize = 10;
export const maxPaginationPageSize = 100;

export function normalizedPage(value: number | string | null | undefined) {
  const parsed =
    typeof value === "number"
      ? value
      : value
        ? Number.parseInt(value, 10)
        : 1;

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.floor(parsed));
}

export function normalizedPageSize(
  value: number | string | null | undefined,
  fallback = defaultPaginationPageSize,
) {
  const parsed =
    typeof value === "number"
      ? value
      : value
        ? Number.parseInt(value, 10)
        : fallback;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(maxPaginationPageSize, Math.max(1, Math.trunc(parsed)));
}
