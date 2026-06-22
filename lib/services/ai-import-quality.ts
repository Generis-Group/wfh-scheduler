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

const genericTitlePhrases = new Set([
  "activity completed",
  "completed task",
  "noted",
  "status update",
  "task completed",
  "task done",
  "work completed",
  "work update",
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

const preservedUppercaseTokens = new Set([
  "AI",
  "AM",
  "API",
  "CRM",
  "CSV",
  "HR",
  "ID",
  "IT",
  "PDF",
  "PM",
  "QA",
  "SSO",
  "UI",
  "URL",
  "WFH",
]);

function normalizedTitlePhrase(title: string) {
  return (title.match(/[A-Za-z0-9]+/g) ?? [])
    .map((word) => word.toLowerCase())
    .join(" ");
}

function trimTitleAtWordBoundary(title: string, maxLength = 96) {
  if (title.length <= maxLength) {
    return title;
  }

  const truncated = title.slice(0, maxLength + 1);
  const lastSpace = truncated.lastIndexOf(" ");
  const boundary =
    lastSpace >= Math.floor(maxLength * 0.65) ? lastSpace : maxLength;

  return `${title.slice(0, boundary).trimEnd()}...`;
}

function stripGenericTitlePrefix(title: string) {
  const match = title.match(
    /^(?:activity completed|completed task|status update|task completed|task done|work completed|work update)\s*[:\-\u2013\u2014]\s*(.+)$/i,
  );

  return match?.[1]?.trim() || title;
}

function isMostlyUppercaseTitle(title: string) {
  const letters = title.match(/[A-Za-z]/g) ?? [];

  if (letters.length < 4) {
    return false;
  }

  const uppercaseLetters = letters.filter(
    (letter) => letter === letter.toLocaleUpperCase(),
  );

  return uppercaseLetters.length / letters.length >= 0.8;
}

function normalizeUppercaseToken(token: string) {
  if (
    /^[A-Z]+-\d+[A-Z0-9-]*$/.test(token) ||
    (/[A-Z]/.test(token) && /\d/.test(token)) ||
    preservedUppercaseTokens.has(token)
  ) {
    return token;
  }

  return token.toLocaleLowerCase();
}

function sentenceCaseImportedTitle(title: string) {
  const casedTitle = isMostlyUppercaseTitle(title)
    ? title.replace(/[A-Z0-9-]+/g, normalizeUppercaseToken)
    : title;

  return `${casedTitle.charAt(0).toLocaleUpperCase()}${casedTitle.slice(1)}`;
}

export function formatImportedActivityTitle(title?: string | null) {
  const stripped = stripGenericTitlePrefix(
    (title ?? "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/[.!?]+$/g, ""),
  );
  const trimmed = trimTitleAtWordBoundary(stripped);

  if (!trimmed) {
    return "";
  }

  return sentenceCaseImportedTitle(trimmed);
}

export function isDescriptiveImportedActivityTitle(title: string) {
  const formattedTitle = formatImportedActivityTitle(title);

  if (genericTitlePhrases.has(normalizedTitlePhrase(formattedTitle))) {
    return false;
  }

  const words = (formattedTitle.match(/[A-Za-z0-9]+/g) ?? []).map((word) => ({
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
