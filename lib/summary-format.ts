export type TextSegment = {
  text: string;
  blocker: boolean;
};

type MarkdownListLine = {
  content: string;
  level: number;
  ordered: boolean;
};

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

export function stripInlineFormatMarkers(value: string) {
  return value.replace(/\*\*(.*?)\*\*/g, "$1").replace(/_(.*?)_/g, "$1");
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

function renderInlineSummaryHtml(text: string, blockerItems: string[]): string {
  const nodes: string[] = [];
  let index = 0;

  while (index < text.length) {
    if (text.startsWith("**", index)) {
      const close = text.indexOf("**", index + 2);

      if (close !== -1) {
        nodes.push(`<strong>${renderInlineSummaryHtml(text.slice(index + 2, close), blockerItems)}</strong>`);
        index = close + 2;
        continue;
      }
    }

    if (text[index] === "_") {
      const close = text.indexOf("_", index + 1);

      if (close !== -1) {
        nodes.push(`<em>${renderInlineSummaryHtml(text.slice(index + 1, close), blockerItems)}</em>`);
        index = close + 1;
        continue;
      }
    }

    const nextBold = text.indexOf("**", index);
    const nextItalic = text.indexOf("_", index);
    let nextMarker = [nextBold, nextItalic].filter((position) => position !== -1).sort((left, right) => left - right)[0] ?? text.length;

    if (nextMarker === index) {
      nextMarker = index + 1;
    }

    const plainText = text.slice(index, nextMarker);

    splitBlockerText(plainText, blockerItems).forEach((segment) => {
      const escapedText = escapeHtml(segment.text);
      nodes.push(segment.blocker ? `<mark class="summary-blocker-highlight">${escapedText}</mark>` : escapedText);
    });
    index = nextMarker;
  }

  return nodes.join("");
}

function markdownListLevel(whitespace: string) {
  const columns = whitespace.split("").reduce((total, character) => total + (character === "\t" ? 2 : 1), 0);
  return Math.floor(columns / 2);
}

function renderMarkdownList(lines: MarkdownListLine[], startIndex: number, level: number, ordered: boolean, blockerItems: string[]) {
  const tagName = ordered ? "ol" : "ul";
  let html = `<${tagName}>`;
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (line.level < level || line.level !== level || line.ordered !== ordered) {
      break;
    }

    html += `<li>${renderInlineSummaryHtml(line.content, blockerItems)}`;
    index += 1;

    while (index < lines.length && lines[index].level > level) {
      const nested = renderMarkdownList(lines, index, lines[index].level, lines[index].ordered, blockerItems);
      html += nested.html;
      index = nested.index;
    }

    html += "</li>";
  }

  html += `</${tagName}>`;

  return { html, index };
}

function renderMarkdownListBlock(lines: string[], startIndex: number, blockerItems: string[]) {
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
    const rendered = renderMarkdownList(listLines, listIndex, listLines[listIndex].level, listLines[listIndex].ordered, blockerItems);
    html += rendered.html;
    listIndex = rendered.index;
  }

  return { html, index };
}

export function markdownToSummaryHtml(value: string, blockerItems: string[]) {
  if (!value) {
    return "";
  }

  const lines = value.split("\n");
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (/^\s*(-|\d+\.)\s+/.test(line)) {
      const rendered = renderMarkdownListBlock(lines, index, blockerItems);
      html.push(rendered.html);
      index = rendered.index;
      continue;
    }

    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      html.push(`<h2>${renderInlineSummaryHtml(heading[1], blockerItems)}</h2>`);
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
        quoteLines.push(renderInlineSummaryHtml(nextQuote[1], blockerItems));
        index += 1;
      }
      html.push(`<blockquote>${quoteLines.join("<br>")}</blockquote>`);
      continue;
    }

    html.push(line ? `<p>${renderInlineSummaryHtml(line, blockerItems)}</p>` : "<p></p>");
    index += 1;
  }

  return html.join("");
}
