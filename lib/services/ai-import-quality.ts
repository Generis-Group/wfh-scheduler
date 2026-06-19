const genericTitleWords = new Set([
  "activity",
  "activities",
  "complete",
  "completed",
  "done",
  "finish",
  "finished",
  "handled",
  "item",
  "items",
  "noted",
  "status",
  "task",
  "tasks",
  "update",
  "updated",
  "work",
]);

const nonActionableStatuses = new Set([
  "n/a",
  "na",
  "none",
  "not applicable",
  "note",
  "noted",
  "status",
  "unknown",
]);

export function isDescriptiveImportedActivityTitle(title: string) {
  const words = (title.match(/[A-Za-z0-9]+/g) ?? []).map((word) => ({
    raw: word,
    normalized: word.toLowerCase(),
  }));

  if (words.length < 2) {
    return false;
  }

  function isShortAcronym(word: string) {
    return (
      /^[A-Z0-9]{2,5}$/.test(word) && /[A-Z]/.test(word) && !/^\d+$/.test(word)
    );
  }

  const specificWords = words.filter(
    ({ raw, normalized }) =>
      (normalized.length > 2 || isShortAcronym(raw)) &&
      !/^\d+$/.test(normalized) &&
      !genericTitleWords.has(normalized),
  );

  return (
    specificWords.length >= 2 ||
    (specificWords.length >= 1 && words.length >= 3)
  );
}

export function importedActivityStatusOrNull(status?: string | null) {
  const normalized = status?.trim();

  if (!normalized || nonActionableStatuses.has(normalized.toLowerCase())) {
    return null;
  }

  return normalized;
}
