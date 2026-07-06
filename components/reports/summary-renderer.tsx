import type { ReactNode } from "react";

import type { ActivitySourceLink } from "@/lib/activity-source-links";
import {
  normalizeSummaryActivitySource,
  normalizeSummaryLinkHref,
  summaryActivityReferenceIdFromHref,
  summaryActivityReferenceSource,
  summaryLinkAt,
  summaryPlainText,
  type SummaryActivityReferenceMap,
} from "@/lib/summary-format";
import { cn } from "@/lib/utils";

type SummaryRendererProps = {
  value?: string | null;
  activityReferences?: SummaryActivityReferenceMap;
  emptyText?: string;
  className?: string;
};

type MarkdownListLine = {
  content: string;
  level: number;
  ordered: boolean;
  number: number | null;
};

export { summaryPlainText };

function markdownListLevel(whitespace: string) {
  const columns = whitespace.split("").reduce((total, character) => total + (character === "\t" ? 2 : 1), 0);
  return Math.floor(columns / 2);
}

function resolvedActivityReferenceHref(
  link: NonNullable<ReturnType<typeof summaryLinkAt>>,
  activityReferences?: SummaryActivityReferenceMap,
) {
  if (link.external) {
    return link.href;
  }

  const activityId = summaryActivityReferenceIdFromHref(link.href);

  return activityId
    ? normalizeSummaryLinkHref(activityReferences?.[activityId]?.href)
    : null;
}

function resolvedActivityReferenceLinks(
  link: NonNullable<ReturnType<typeof summaryLinkAt>>,
  activityReferences?: SummaryActivityReferenceMap,
): ActivitySourceLink[] {
  if (link.external) {
    return [{ href: link.href, label: "Open source", source: null }];
  }

  const activityId = summaryActivityReferenceIdFromHref(link.href);
  const meta = activityId ? activityReferences?.[activityId] : null;
  const links = [
    ...(meta?.links ?? []),
    meta?.href
      ? {
          href: meta.href,
          label: "Open source",
          source: meta.source,
        }
      : null,
  ];
  const seen = new Set<string>();
  const uniqueLinks: ActivitySourceLink[] = [];

  for (const item of links) {
    const href = normalizeSummaryLinkHref(item?.href);

    if (!href || seen.has(href)) {
      continue;
    }

    seen.add(href);
    uniqueLinks.push({
      href,
      label: item?.label?.trim() || "Open source",
      source: item?.source ?? null,
    });
  }

  return uniqueLinks;
}

function resolvedActivityReferenceLabel(
  link: NonNullable<ReturnType<typeof summaryLinkAt>>,
  activityReferences?: SummaryActivityReferenceMap,
) {
  const activityId = summaryActivityReferenceIdFromHref(link.href);
  const title = activityId
    ? activityReferences?.[activityId]?.title?.trim()
    : null;

  return title || link.label;
}

function resolvedActivityReferenceSource(
  link: NonNullable<ReturnType<typeof summaryLinkAt>>,
  label: string,
  activityReferences?: SummaryActivityReferenceMap,
) {
  const activityId = summaryActivityReferenceIdFromHref(link.href);
  const source = activityId
    ? activityReferences?.[activityId]?.source
    : null;
  const normalizedSource = normalizeSummaryActivitySource(source);

  return normalizedSource !== "UNKNOWN"
    ? normalizedSource
    : summaryActivityReferenceSource(link.href, label);
}

function renderActivityReference(
  link: NonNullable<ReturnType<typeof summaryLinkAt>>,
  children: ReactNode[],
  key: string,
  activityReferences?: SummaryActivityReferenceMap,
) {
  const label = resolvedActivityReferenceLabel(link, activityReferences);
  const source = resolvedActivityReferenceSource(
    link,
    label,
    activityReferences,
  );
  const links = resolvedActivityReferenceLinks(link, activityReferences);
  const content = (
    <span className="summary-activity-reference-card" data-source={source}>
      <span className="summary-activity-reference-icon" aria-hidden="true">
        <span className="summary-activity-reference-symbol" />
      </span>
      <span className="summary-activity-reference-label">{children}</span>
    </span>
  );

  if (links.length > 1) {
    return (
      <details
        key={key}
        className="summary-activity-reference-picker relative inline-block align-baseline"
      >
        <summary className="summary-activity-reference cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          {content}
        </summary>
        <span className="absolute left-0 top-full z-30 mt-1 flex w-56 flex-col rounded-[10px] bg-white p-1 text-sm shadow-[0_16px_38px_rgba(15,23,42,0.16)] ring-1 ring-border dark:bg-card dark:ring-border">
          {links.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="rounded-[7px] px-3 py-2 text-left font-medium text-foreground-muted hover:bg-primary-subtle hover:text-primary-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-foreground dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
            >
              {item.label}
            </a>
          ))}
        </span>
      </details>
    );
  }

  const href =
    links[0]?.href ?? resolvedActivityReferenceHref(link, activityReferences);

  return href ? (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noreferrer"
      className="summary-activity-reference"
    >
      {content}
    </a>
  ) : (
    <span key={key} className="summary-activity-reference">
      {content}
    </span>
  );
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

function renderInline(
  value: string,
  keyPrefix: string,
  activityReferences?: SummaryActivityReferenceMap,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < value.length) {
    const link = summaryLinkAt(value, index);

    if (link) {
      const label = resolvedActivityReferenceLabel(link, activityReferences);
      const children = renderInline(
        label,
        `${keyPrefix}-link-${index}`,
        activityReferences,
      );

      nodes.push(
        renderActivityReference(
          link,
          children,
          `${keyPrefix}-link-${index}`,
          activityReferences,
        ),
      );
      index += link.length;
      continue;
    }

    if (value.startsWith("**", index)) {
      const close = value.indexOf("**", index + 2);

      if (close !== -1) {
        nodes.push(
          <strong key={`${keyPrefix}-strong-${index}`} className="font-semibold">
            {renderInline(
              value.slice(index + 2, close),
              `${keyPrefix}-strong-${index}`,
              activityReferences,
            )}
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
            {renderInline(
              value.slice(index + 1, close),
              `${keyPrefix}-em-${index}`,
              activityReferences,
            )}
          </em>
        );
        index = close + 1;
        continue;
      }
    }

    const nextBold = value.indexOf("**", index);
    const nextItalic = value.indexOf("_", index);
    const nextLink = nextSummaryLinkIndex(value, index);
    let nextMarker = [nextLink, nextBold, nextItalic].filter((position) => position !== -1).sort((left, right) => left - right)[0] ?? value.length;

    if (nextMarker === index) {
      nextMarker = index + 1;
    }

    nodes.push(
      <span key={`${keyPrefix}-text-${index}`}>
        {value.slice(index, nextMarker)}
      </span>,
    );
    index = nextMarker;
  }

  return nodes;
}

function renderMarkdownList(
  lines: MarkdownListLine[],
  startIndex: number,
  level: number,
  ordered: boolean,
  keyPrefix: string,
  activityReferences?: SummaryActivityReferenceMap,
) {
  const TagName = ordered ? "ol" : "ul";
  const start = ordered ? lines[startIndex].number ?? 1 : undefined;
  const items: ReactNode[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (line.level < level || line.level !== level || line.ordered !== ordered) {
      break;
    }

    const children: ReactNode[] = [
      ...renderInline(
        line.content,
        `${keyPrefix}-item-${index}`,
        activityReferences,
      ),
    ];
    index += 1;

    while (index < lines.length && lines[index].level > level) {
      const nested = renderMarkdownList(
        lines,
        index,
        lines[index].level,
        lines[index].ordered,
        `${keyPrefix}-nested-${index}`,
        activityReferences,
      );
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
      <TagName
        key={keyPrefix}
        className={cn("my-0 pl-5", ordered ? "list-decimal" : "list-disc")}
        start={ordered && start !== 1 ? start : undefined}
      >
        {items}
      </TagName>
    ),
    index
  };
}

function renderMarkdownListBlock(
  lines: string[],
  startIndex: number,
  keyPrefix: string,
  activityReferences?: SummaryActivityReferenceMap,
) {
  const listLines: MarkdownListLine[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const match = lines[index].match(/^(\s*)(-|\d+\.)\s+(.*)$/);

    if (!match) {
      break;
    }

    const number = match[2].endsWith(".")
      ? Number.parseInt(match[2].slice(0, -1), 10)
      : null;

    listLines.push({
      content: match[3],
      level: markdownListLevel(match[1]),
      ordered: /^\d+\.$/.test(match[2]),
      number: Number.isFinite(number) ? number : null,
    });
    index += 1;
  }

  const nodes: ReactNode[] = [];
  let listIndex = 0;

  while (listIndex < listLines.length) {
    const rendered = renderMarkdownList(
      listLines,
      listIndex,
      listLines[listIndex].level,
      listLines[listIndex].ordered,
      `${keyPrefix}-list-${listIndex}`,
      activityReferences,
    );
    nodes.push(rendered.node);
    listIndex = rendered.index;
  }

  return { nodes, index };
}

function renderBlocks(
  value: string,
  activityReferences?: SummaryActivityReferenceMap,
) {
  const lines = value.split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (/^\s*(-|\d+\.)\s+/.test(line)) {
      const rendered = renderMarkdownListBlock(
        lines,
        index,
        `block-${index}`,
        activityReferences,
      );
      nodes.push(...rendered.nodes);
      index = rendered.index;
      continue;
    }

    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      nodes.push(
        <h3 key={`heading-${index}`} className="my-0 text-xl font-normal leading-7 text-foreground dark:text-foreground">
          {renderInline(
            heading[1],
            `heading-${index}`,
            activityReferences,
          )}
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
        quoteLines.push(
          ...renderInline(
            nextQuote[1],
            `quote-${index}`,
            activityReferences,
          ),
        );
        index += 1;
      }
      nodes.push(
        <blockquote key={`quote-${index}`} className="my-0 border-l-2 border-[#c7d2fe] pl-3 text-foreground-muted dark:border-blue-300/30 dark:text-muted-foreground">
          {quoteLines}
        </blockquote>
      );
      continue;
    }

    nodes.push(
      <p key={`paragraph-${index}`} className="my-0 min-h-6">
        {line ? (
          renderInline(
            line,
            `paragraph-${index}`,
            activityReferences,
          )
        ) : (
          <br />
        )}
      </p>
    );
    index += 1;
  }

  return nodes;
}

export function SummaryRenderer({
  value,
  activityReferences,
  emptyText = "No summary entered.",
  className,
}: SummaryRendererProps) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return <p className={cn("text-sm text-muted-foreground dark:text-muted-foreground", className)}>{emptyText}</p>;
  }

  return <div className={cn("space-y-1 text-sm leading-6 text-foreground dark:text-foreground", className)}>{renderBlocks(value ?? "", activityReferences)}</div>;
}
