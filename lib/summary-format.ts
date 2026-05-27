export type TextSegment = {
  text: string;
  blocker: boolean;
};

export type SummaryLinkMatch = {
  label: string;
  href: string;
  length: number;
  external: boolean;
};

export type SummaryActivitySource =
  | "JIRA"
  | "GOOGLE_CALENDAR"
  | "GOOGLE_TASKS"
  | "MANUAL"
  | "UNKNOWN";

export type SummaryActivityReferenceMeta = {
  title?: string | null;
  href?: string | null;
  source?: string | null;
};

export type SummaryActivityReferenceMap = Record<
  string,
  SummaryActivityReferenceMeta | null | undefined
>;

type MarkdownListLine = {
  content: string;
  level: number;
  ordered: boolean;
};

const summaryActivityReferenceHrefPrefix = "https://generis.local/activity/";
const summaryActivitySources = new Set<SummaryActivitySource>([
  "JIRA",
  "GOOGLE_CALENDAR",
  "GOOGLE_TASKS",
  "MANUAL",
  "UNKNOWN",
]);

export function extractBlockerLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*blockers?:\s*(.*)$/i)?.[1])
    .filter((line): line is string => line !== undefined && line.trim().length > 0)
    .join("\n");
}

export function stripLegacyBlockerPrefixes(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*blockers?:\s*(.*)$/i)?.[1] ?? line)
    .join("\n");
}

export function uniqueLines(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
  ).join("\n");
}

export function lineItems(value?: string | null) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeSummaryLinkHref(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed === "#") {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeSummaryActivitySource(
  value?: string | null,
): SummaryActivitySource {
  const normalized = value?.trim().toUpperCase().replace(/[-\s]+/g, "_");

  return normalized && summaryActivitySources.has(normalized as SummaryActivitySource)
    ? (normalized as SummaryActivitySource)
    : "UNKNOWN";
}

export function summaryActivityReferenceHref(
  activityId?: string | null,
  source?: string | null,
) {
  const trimmed = activityId?.trim();

  if (!trimmed) {
    return null;
  }

  const normalizedSource = normalizeSummaryActivitySource(source);
  const sourceQuery =
    normalizedSource === "UNKNOWN"
      ? ""
      : `?source=${encodeURIComponent(normalizedSource)}`;

  return `${summaryActivityReferenceHrefPrefix}${encodeURIComponent(trimmed)}${sourceQuery}`;
}

export function isSummaryActivityReferenceHref(value?: string | null) {
  const trimmed = value?.trim();

  return Boolean(
    trimmed?.startsWith(summaryActivityReferenceHrefPrefix) &&
      trimmed.length > summaryActivityReferenceHrefPrefix.length,
  );
}

export function summaryActivityReferenceIdFromHref(value?: string | null) {
  const trimmed = value?.trim();

  if (!isSummaryActivityReferenceHref(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed!);
    const activityId = url.pathname.replace(/^\/activity\//, "");

    return activityId ? decodeURIComponent(activityId) : null;
  } catch {
    return null;
  }
}

export function summaryActivityReferenceSource(
  href?: string | null,
  label?: string | null,
): SummaryActivitySource {
  const trimmedHref = href?.trim();
  const trimmedLabel = label?.trim() ?? "";

  if (isSummaryActivityReferenceHref(trimmedHref)) {
    try {
      const url = new URL(trimmedHref!);
      const source = normalizeSummaryActivitySource(url.searchParams.get("source"));

      if (source !== "UNKNOWN") {
        return source;
      }
    } catch {
      // Fall through to the lightweight inference below.
    }
  }

  const lowerHref = trimmedHref?.toLowerCase() ?? "";

  if (
    lowerHref.includes("atlassian") ||
    lowerHref.includes("jira") ||
    /^[A-Z][A-Z0-9]+-\d+\b/.test(trimmedLabel)
  ) {
    return "JIRA";
  }

  if (
    lowerHref.includes("calendar.google") ||
    lowerHref.includes("google.com/calendar")
  ) {
    return "GOOGLE_CALENDAR";
  }

  if (
    lowerHref.includes("tasks.google") ||
    lowerHref.includes("google.com/tasks")
  ) {
    return "GOOGLE_TASKS";
  }

  return "UNKNOWN";
}

function normalizeSummaryReferenceHref(value?: string | null) {
  const trimmed = value?.trim();

  if (isSummaryActivityReferenceHref(trimmed)) {
    return { href: trimmed!, external: false };
  }

  const externalHref = normalizeSummaryLinkHref(value);

  return externalHref ? { href: externalHref, external: true } : null;
}

function markdownLinkLabel(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\[\]]/g, "")
    .trim();
}

function markdownLinkHref(value: string) {
  return value.replace(/\)/g, "%29");
}

export function summaryActivityReferenceMarkdown(
  title: string,
  href?: string | null,
) {
  const label = markdownLinkLabel(title) || "Untitled activity";
  const normalizedHref = normalizeSummaryReferenceHref(href);

  return normalizedHref
    ? `[${label}](${markdownLinkHref(normalizedHref.href)})`
    : label;
}

export function summaryLinkAt(value: string, index: number): SummaryLinkMatch | null {
  const match = value.slice(index).match(/^\[([^\]\n]+)\]\(([^)\n]+)\)/);

  if (!match) {
    return null;
  }

  const reference = normalizeSummaryReferenceHref(match[2]);

  if (!reference) {
    return null;
  }

  return {
    label: match[1],
    href: reference.href,
    external: reference.external,
    length: match[0].length
  };
}

function cleanupRemovedActivityReferences(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]+([,.;:!?])/g, "$1")
        .replace(/^[ \t]+(?=\S)/, "")
        .trimEnd(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function removeSummaryActivityReferences(
  value: string,
  activityIds: string | string[],
) {
  const ids = new Set(
    (Array.isArray(activityIds) ? activityIds : [activityIds])
      .map((id) => id.trim())
      .filter(Boolean),
  );

  if (!value || ids.size === 0) {
    return value;
  }

  let next = "";
  let index = 0;
  let removed = false;

  while (index < value.length) {
    const link = summaryLinkAt(value, index);
    const activityId = link
      ? summaryActivityReferenceIdFromHref(link.href)
      : null;

    if (link && activityId && ids.has(activityId)) {
      index += link.length;
      removed = true;
      continue;
    }

    next += value[index];
    index += 1;
  }

  return removed ? cleanupRemovedActivityReferences(next) : value;
}

function nextSummaryLinkIndex(value: string, startIndex: number) {
  let index = value.indexOf("[", startIndex);

  while (index !== -1) {
    if (summaryLinkAt(value, index)) {
      return index;
    }

    index = value.indexOf("[", index + 1);
  }

  return -1;
}

function stripSummaryLinks(value: string) {
  return value.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (match, label, href) =>
    normalizeSummaryReferenceHref(href) ? label : match,
  );
}

export function stripInlineFormatMarkers(value: string) {
  return stripSummaryLinks(value)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/_(.*?)_/g, "$1");
}

function stripBlockMarkers(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^##\s+/, "")
        .replace(/^>\s?/, "")
        .replace(/^\s*(-|\d+\.)\s+/, "")
    )
    .join(" ");
}

export function summaryPlainText(value?: string | null, emptyText = "No summary entered.") {
  const text = stripInlineFormatMarkers(stripBlockMarkers(value ?? ""))
    .replace(/\s+/g, " ")
    .trim();

  return text || emptyText;
}

export function splitBlockerText(value: string, blockerItems: string[]): TextSegment[] {
  const blockers = blockerItems
    .map((item) => item.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  if (blockers.length === 0 || value.length === 0) {
    return [{ text: value, blocker: false }];
  }

  const lowerValue = value.toLowerCase();
  const lowerBlockers = blockers.map((blocker) => ({ value: blocker, lower: blocker.toLowerCase() }));
  const segments: TextSegment[] = [];
  let index = 0;

  while (index < value.length) {
    let nextMatch: { start: number; blocker: string } | null = null;

    for (const blocker of lowerBlockers) {
      const start = lowerValue.indexOf(blocker.lower, index);

      if (start === -1) {
        continue;
      }

      if (!nextMatch || start < nextMatch.start || (start === nextMatch.start && blocker.value.length > nextMatch.blocker.length)) {
        nextMatch = { start, blocker: blocker.value };
      }
    }

    if (!nextMatch) {
      segments.push({ text: value.slice(index), blocker: false });
      break;
    }

    if (nextMatch.start > index) {
      segments.push({ text: value.slice(index, nextMatch.start), blocker: false });
    }

    segments.push({
      text: value.slice(nextMatch.start, nextMatch.start + nextMatch.blocker.length),
      blocker: true
    });
    index = nextMatch.start + nextMatch.blocker.length;
  }

  return segments.length ? segments : [{ text: value, blocker: false }];
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function activityReferenceMetaFromMap(
  href: string,
  activityReferences?: SummaryActivityReferenceMap,
) {
  const activityId = summaryActivityReferenceIdFromHref(href);

  return activityId ? activityReferences?.[activityId] ?? null : null;
}

function activityReferenceLabelFromMeta(
  fallbackLabel: string,
  meta?: SummaryActivityReferenceMeta | null,
) {
  return markdownLinkLabel(meta?.title ?? fallbackLabel) || "Untitled activity";
}

function renderInlineSummaryHtml(
  text: string,
  blockerItems: string[],
  activityReferences?: SummaryActivityReferenceMap,
): string {
  const nodes: string[] = [];
  let index = 0;

  while (index < text.length) {
    const link = summaryLinkAt(text, index);

    if (link) {
      const activityMeta = activityReferenceMetaFromMap(
        link.href,
        activityReferences,
      );
      const label = activityReferenceLabelFromMeta(link.label, activityMeta);
      const metaSource = normalizeSummaryActivitySource(activityMeta?.source);
      const source =
        metaSource !== "UNKNOWN"
          ? metaSource
          : summaryActivityReferenceSource(link.href, label);
      const activityId = summaryActivityReferenceIdFromHref(link.href);
      const activityIdAttribute = activityId
        ? ` data-activity-id="${escapeHtml(activityId)}"`
        : "";
      nodes.push(
        `<span class="summary-activity-reference-node" data-summary-activity-reference="true" data-source="${escapeHtml(source)}" data-href="${escapeHtml(link.href)}"${activityIdAttribute}>${escapeHtml(label)}</span>`,
      );
      index += link.length;
      continue;
    }

    if (text.startsWith("**", index)) {
      const close = text.indexOf("**", index + 2);

      if (close !== -1) {
        nodes.push(
          `<strong>${renderInlineSummaryHtml(
            text.slice(index + 2, close),
            blockerItems,
            activityReferences,
          )}</strong>`,
        );
        index = close + 2;
        continue;
      }
    }

    if (text[index] === "_") {
      const close = text.indexOf("_", index + 1);

      if (close !== -1) {
        nodes.push(
          `<em>${renderInlineSummaryHtml(
            text.slice(index + 1, close),
            blockerItems,
            activityReferences,
          )}</em>`,
        );
        index = close + 1;
        continue;
      }
    }

    const nextBold = text.indexOf("**", index);
    const nextItalic = text.indexOf("_", index);
    const nextLink = nextSummaryLinkIndex(text, index);
    let nextMarker = [nextLink, nextBold, nextItalic].filter((position) => position !== -1).sort((left, right) => left - right)[0] ?? text.length;

    if (nextMarker === index) {
      nextMarker = index + 1;
    }

    const plainText = text.slice(index, nextMarker);

    splitBlockerText(plainText, blockerItems).forEach((segment) => {
      const escapedText = escapeHtml(segment.text);
      nodes.push(segment.blocker ? `<mark class="summary-blocker-mark">${escapedText}</mark>` : escapedText);
    });
    index = nextMarker;
  }

  return nodes.join("");
}

function markdownListLevel(whitespace: string) {
  const columns = whitespace.split("").reduce((total, character) => total + (character === "\t" ? 2 : 1), 0);
  return Math.floor(columns / 2);
}

function renderMarkdownList(
  lines: MarkdownListLine[],
  startIndex: number,
  level: number,
  ordered: boolean,
  blockerItems: string[],
  activityReferences?: SummaryActivityReferenceMap,
) {
  const tagName = ordered ? "ol" : "ul";
  let html = `<${tagName}>`;
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (line.level < level || line.level !== level || line.ordered !== ordered) {
      break;
    }

    html += `<li>${renderInlineSummaryHtml(
      line.content,
      blockerItems,
      activityReferences,
    )}`;
    index += 1;

    while (index < lines.length && lines[index].level > level) {
      const nested = renderMarkdownList(
        lines,
        index,
        lines[index].level,
        lines[index].ordered,
        blockerItems,
        activityReferences,
      );
      html += nested.html;
      index = nested.index;
    }

    html += "</li>";
  }

  html += `</${tagName}>`;

  return { html, index };
}

function renderMarkdownListBlock(
  lines: string[],
  startIndex: number,
  blockerItems: string[],
  activityReferences?: SummaryActivityReferenceMap,
) {
  const listLines: MarkdownListLine[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const match = lines[index].match(/^(\s*)(-|\d+\.)\s+(.*)$/);

    if (!match) {
      break;
    }

    listLines.push({
      content: match[3],
      level: markdownListLevel(match[1]),
      ordered: /^\d+\.$/.test(match[2])
    });
    index += 1;
  }

  let html = "";
  let listIndex = 0;

  while (listIndex < listLines.length) {
    const rendered = renderMarkdownList(
      listLines,
      listIndex,
      listLines[listIndex].level,
      listLines[listIndex].ordered,
      blockerItems,
      activityReferences,
    );
    html += rendered.html;
    listIndex = rendered.index;
  }

  return { html, index };
}

export function markdownToSummaryHtml(
  value: string,
  blockerItems: string[],
  activityReferences?: SummaryActivityReferenceMap,
) {
  if (!value) {
    return "";
  }

  const lines = value.split("\n");
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (/^\s*(-|\d+\.)\s+/.test(line)) {
      const rendered = renderMarkdownListBlock(
        lines,
        index,
        blockerItems,
        activityReferences,
      );
      html.push(rendered.html);
      index = rendered.index;
      continue;
    }

    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      html.push(
        `<h2>${renderInlineSummaryHtml(
          heading[1],
          blockerItems,
          activityReferences,
        )}</h2>`,
      );
      index += 1;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const nextQuote = lines[index].match(/^>\s?(.*)$/);
        if (!nextQuote) {
          break;
        }
        quoteLines.push(
          renderInlineSummaryHtml(
            nextQuote[1],
            blockerItems,
            activityReferences,
          ),
        );
        index += 1;
      }
      html.push(`<blockquote>${quoteLines.join("<br>")}</blockquote>`);
      continue;
    }

    html.push(
      line
        ? `<p>${renderInlineSummaryHtml(
            line,
            blockerItems,
            activityReferences,
          )}</p>`
        : "<p></p>",
    );
    index += 1;
  }

  return html.join("");
}
