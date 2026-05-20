import type { ReactNode } from "react";

import { lineItems, splitBlockerText, summaryPlainText } from "@/lib/summary-format";
import { cn } from "@/lib/utils";

type SummaryRendererProps = {
  value?: string | null;
  blockers?: string | null;
  emptyText?: string;
  className?: string;
};

type MarkdownListLine = {
  content: string;
  level: number;
  ordered: boolean;
};

export { summaryPlainText };

function markdownListLevel(whitespace: string) {
  const columns = whitespace.split("").reduce((total, character) => total + (character === "\t" ? 2 : 1), 0);
  return Math.floor(columns / 2);
}

function renderPlainText(value: string, blockerItems: string[], keyPrefix: string) {
  return splitBlockerText(value, blockerItems).map((segment, index) =>
    segment.blocker ? (
      <mark key={`${keyPrefix}-mark-${index}`} className="summary-blocker-highlight">
        {segment.text}
      </mark>
    ) : (
      <span key={`${keyPrefix}-text-${index}`}>{segment.text}</span>
    )
  );
}

function renderInline(value: string, blockerItems: string[], keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < value.length) {
    if (value.startsWith("**", index)) {
      const close = value.indexOf("**", index + 2);

      if (close !== -1) {
        nodes.push(
          <strong key={`${keyPrefix}-strong-${index}`} className="font-semibold">
            {renderInline(value.slice(index + 2, close), blockerItems, `${keyPrefix}-strong-${index}`)}
          </strong>
        );
        index = close + 2;
        continue;
      }
    }

    if (value[index] === "_") {
      const close = value.indexOf("_", index + 1);

      if (close !== -1) {
        nodes.push(
          <em key={`${keyPrefix}-em-${index}`}>
            {renderInline(value.slice(index + 1, close), blockerItems, `${keyPrefix}-em-${index}`)}
          </em>
        );
        index = close + 1;
        continue;
      }
    }

    const nextBold = value.indexOf("**", index);
    const nextItalic = value.indexOf("_", index);
    let nextMarker = [nextBold, nextItalic].filter((position) => position !== -1).sort((left, right) => left - right)[0] ?? value.length;

    if (nextMarker === index) {
      nextMarker = index + 1;
    }

    nodes.push(...renderPlainText(value.slice(index, nextMarker), blockerItems, `${keyPrefix}-plain-${index}`));
    index = nextMarker;
  }

  return nodes;
}

function renderMarkdownList(lines: MarkdownListLine[], startIndex: number, level: number, ordered: boolean, blockerItems: string[], keyPrefix: string) {
  const TagName = ordered ? "ol" : "ul";
  const items: ReactNode[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (line.level < level || line.level !== level || line.ordered !== ordered) {
      break;
    }

    const children: ReactNode[] = [...renderInline(line.content, blockerItems, `${keyPrefix}-item-${index}`)];
    index += 1;

    while (index < lines.length && lines[index].level > level) {
      const nested = renderMarkdownList(lines, index, lines[index].level, lines[index].ordered, blockerItems, `${keyPrefix}-nested-${index}`);
      children.push(nested.node);
      index = nested.index;
    }

    items.push(
      <li key={`${keyPrefix}-li-${index}`} className="pl-1">
        {children}
      </li>
    );
  }

  return {
    node: (
      <TagName key={keyPrefix} className={cn("my-0 pl-5", ordered ? "list-decimal" : "list-disc")}>
        {items}
      </TagName>
    ),
    index
  };
}

function renderMarkdownListBlock(lines: string[], startIndex: number, blockerItems: string[], keyPrefix: string) {
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

  const nodes: ReactNode[] = [];
  let listIndex = 0;

  while (listIndex < listLines.length) {
    const rendered = renderMarkdownList(listLines, listIndex, listLines[listIndex].level, listLines[listIndex].ordered, blockerItems, `${keyPrefix}-list-${listIndex}`);
    nodes.push(rendered.node);
    listIndex = rendered.index;
  }

  return { nodes, index };
}

function renderBlocks(value: string, blockerItems: string[]) {
  const lines = value.split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (/^\s*(-|\d+\.)\s+/.test(line)) {
      const rendered = renderMarkdownListBlock(lines, index, blockerItems, `block-${index}`);
      nodes.push(...rendered.nodes);
      index = rendered.index;
      continue;
    }

    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      nodes.push(
        <h3 key={`heading-${index}`} className="my-0 text-xl font-normal leading-7 text-[#111827] dark:text-foreground">
          {renderInline(heading[1], blockerItems, `heading-${index}`)}
        </h3>
      );
      index += 1;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      const quoteLines: ReactNode[] = [];
      while (index < lines.length) {
        const nextQuote = lines[index].match(/^>\s?(.*)$/);
        if (!nextQuote) {
          break;
        }
        if (quoteLines.length) {
          quoteLines.push(<br key={`quote-br-${index}`} />);
        }
        quoteLines.push(...renderInline(nextQuote[1], blockerItems, `quote-${index}`));
        index += 1;
      }
      nodes.push(
        <blockquote key={`quote-${index}`} className="my-0 border-l-2 border-[#c7d2fe] pl-3 text-[#475467] dark:border-blue-300/30 dark:text-muted-foreground">
          {quoteLines}
        </blockquote>
      );
      continue;
    }

    nodes.push(
      <p key={`paragraph-${index}`} className="my-0 min-h-6">
        {line ? renderInline(line, blockerItems, `paragraph-${index}`) : <br />}
      </p>
    );
    index += 1;
  }

  return nodes;
}

export function SummaryRenderer({ value, blockers, emptyText = "No summary entered.", className }: SummaryRendererProps) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return <p className={cn("text-sm text-[#667085] dark:text-muted-foreground", className)}>{emptyText}</p>;
  }

  return <div className={cn("space-y-1 text-sm leading-6 text-[#111827] dark:text-foreground", className)}>{renderBlocks(value ?? "", lineItems(blockers))}</div>;
}
