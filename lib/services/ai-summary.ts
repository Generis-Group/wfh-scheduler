import "server-only";

import { getGeminiClient, getGeminiModel } from "@/lib/integrations/gemini";
import { HttpError } from "@/lib/http";
import {
  summaryActivityReferenceHref,
  summaryActivityReferenceMarkdown,
  summaryLinkAt,
} from "@/lib/summary-format";

type SummaryActivity = {
  id: string;
  source: string;
  title: string;
  description?: string | null;
  status?: string | null;
  sourceUrl?: string | null;
  startedAt?: string | Date | null;
  endedAt?: string | Date | null;
  durationMinutes?: number | null;
  selected: boolean;
  employeeNote?: string | null;
  staleAt?: string | Date | null;
};

type SummaryReport = {
  reportDate: string | Date;
  workLocation: string;
  summary?: string | null;
  activities: SummaryActivity[];
};

type ActivityReference = {
  token: string;
  markdown: string;
  activity: SummaryActivity;
};

type StructuredInline =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "activity";
      token: string;
    };

type StructuredBlock =
  | {
      type: "paragraph" | "blockquote";
      segments: StructuredInline[];
    }
  | {
      type: "bulletedList" | "numberedList";
      items: Array<{ segments: StructuredInline[] }>;
    };

type StructuredSection = {
  heading: string;
  blocks: StructuredBlock[];
};

type GenerateContentResponse = {
  text?: unknown;
  candidates?: Array<{ finishReason?: unknown }>;
};

const maxPromptActivities = 60;
const maxFieldLength = 260;
const maxSections = 5;
const maxBlocksPerSection = 8;
const maxListItems = 8;
const maxInlineSegments = 14;
const maxRenderedLineLength = 420;

function reportDateLabel(value: string | Date) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function sourceLabel(source: string) {
  if (source === "GOOGLE_CALENDAR") {
    return "Google Calendar";
  }

  if (source === "GOOGLE_TASKS") {
    return "Google Tasks";
  }

  if (source === "JIRA") {
    return "Jira";
  }

  if (source === "MANUAL") {
    return "Manual";
  }

  return source;
}

function durationLabel(minutes?: number | null) {
  if (!minutes) {
    return null;
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (!hours) {
    return `${remaining}m`;
  }

  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function dateTimeLabel(value?: string | Date | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function truncateField(value?: string | null, maxLength = maxFieldLength) {
  const cleaned = value?.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.length > maxLength
    ? `${cleaned.slice(0, maxLength - 1)}...`
    : cleaned;
}

function activityReference(activity: SummaryActivity, index: number) {
  const href = summaryActivityReferenceHref(activity.id, activity.source);

  if (!href) {
    return null;
  }

  return {
    token: `ACTIVITY_${index + 1}`,
    markdown: summaryActivityReferenceMarkdown(activity.title, href),
    activity,
  };
}

function activityPromptLine(reference: ActivityReference) {
  const activity = reference.activity;
  const fields = [
    `token=${reference.token}`,
    `source=${sourceLabel(activity.source)}`,
    `title=${truncateField(activity.title, 160) ?? "Untitled activity"}`,
    activity.status ? `status=${truncateField(activity.status, 80)}` : null,
    durationLabel(activity.durationMinutes),
    dateTimeLabel(activity.startedAt),
    truncateField(activity.description)
      ? `description=${truncateField(activity.description)}`
      : null,
    truncateField(activity.employeeNote)
      ? `note=${truncateField(activity.employeeNote)}`
      : null,
  ].filter(Boolean);

  return `- ${fields.join(" | ")}`;
}

function buildSummaryPrompt(
  report: SummaryReport,
  references: ActivityReference[],
  compact = false,
) {
  const existingSummary = truncateField(report.summary);
  const maxSectionCount = compact ? 3 : maxSections;
  const maxItemsPerList = compact ? 5 : maxListItems;

  return [
    "Create a daily work summary from the selected work items.",
    "Return JSON only.",
    "Use this JSON shape exactly:",
    '{"sections":[{"heading":"Section title","blocks":[{"type":"paragraph","text":"Plain text","activityTokens":["ACTIVITY_1"]},{"type":"bulletedList","items":[{"text":"Plain text","activityTokens":["ACTIVITY_2"]}]},{"type":"numberedList","items":[{"text":"Plain text","activityTokens":[]}]},{"type":"blockquote","text":"Plain text","activityTokens":[]}]}]}',
    "For paragraph and blockquote blocks, use text and activityTokens.",
    "For bulletedList and numberedList blocks, use items with text and activityTokens.",
    "",
    "Formatting intent:",
    "- Use sections with clear headings.",
    "- Prefer bullets outside of short narrative context.",
    "- Use paragraphs only for major work that needs a little explanation.",
    "- Use blockquotes only for actual blockers, risks, or follow-up notes.",
    "- Add activity reference tokens inline only where they support the sentence.",
    "- Never include raw URLs, markdown, HTML, tables, code, or unknown tokens.",
    "",
    "Blocker definition:",
    "- A blocker means work is truly unable to proceed or is on hold because of missing approval, access, information, an external dependency, an outage, or an unresolved decision.",
    "- Do not classify active work, code review, bug fixing, testing, investigation, follow-up, remaining tasks, or in-progress items as blockers unless the item explicitly says it is blocked, on hold, waiting, dependent, or unable to proceed.",
    "- Only create a Blockers section when at least one selected work item explicitly indicates a true blocker. If none exist, omit Blockers entirely; do not write 'No blockers'.",
    "",
    "Completion wording:",
    "- Use completed, resolved, finalized, delivered, deployed, or shipped only when the work item's status or text clearly supports completion.",
    "- For in-progress, open, pending, review, testing, not done, or ambiguous work, use neutral wording such as worked on, continued, advanced, reviewed, investigated, drafted, or started.",
    "- When a sentence combines items with mixed or unclear completion states, do not use a completion verb for the whole group.",
    "",
    "Production update policy:",
    "- Routine production tasks are simple event/site content updates.",
    "- If there are 1-6 routine production updates, enumerate them.",
    "- If there are 7-15, group by event/site or update type and call out only notable examples.",
    "- If there are 16+, summarize by category and include at most 3-5 representative examples.",
    "- Google Tasks are not always routine production. Creating a program, restructuring major content, importing sessions/speakers, or major agenda/data work is substantial and should be highlighted separately.",
    "",
    "Preferred section order when applicable:",
    "1. Production Updates",
    "2. Major project/workstream sections such as On-Demand Program Work",
    "3. Meetings and Follow-Up",
    "4. Blockers, only when actual blockers exist",
    "",
    `Limits: use at most ${maxSectionCount} sections and at most ${maxItemsPerList} items in any list.`,
    "Keep wording concise and professional in first person.",
    "",
    `Report date: ${reportDateLabel(report.reportDate)}`,
    `Work location: ${report.workLocation}`,
    existingSummary ? `Current summary being replaced: ${existingSummary}` : null,
    "",
    "Selected work items:",
    references.map(activityPromptLine).join("\n"),
  ]
    .filter(Boolean)
    .join("\n");
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return match ? match[1].trim() : trimmed;
}

function stripDisallowedLinks(value: string) {
  let next = "";
  let index = 0;

  while (index < value.length) {
    const link = summaryLinkAt(value, index);

    if (!link) {
      next += value[index];
      index += 1;
      continue;
    }

    next += link.label;
    index += link.length;
  }

  return next;
}

function cleanText(value: string, maxLength = maxRenderedLineLength) {
  return stripDisallowedLinks(value)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/\bACTIVITY_\d+\b/g, "")
    .replace(/^#+\s*/, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/[<>|]/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

function responseText(response: GenerateContentResponse) {
  return typeof response.text === "string" ? response.text : "";
}

function responseReachedTokenLimit(response: GenerateContentResponse) {
  return Boolean(
    response.candidates?.some(
      (candidate) => candidate.finishReason === "MAX_TOKENS",
    ),
  );
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(stripCodeFence(value)) as unknown;

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeActivityToken(value: unknown, validTokens: Set<string>) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/\bACTIVITY_\d+\b/);
  const token = match?.[0] ?? "";

  return validTokens.has(token) ? token : null;
}

function normalizeActivityTokens(value: unknown, validTokens: Set<string>) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const rawToken of value) {
    const token = normalizeActivityToken(rawToken, validTokens);

    if (!token || seen.has(token)) {
      continue;
    }

    seen.add(token);
    tokens.push(token);
  }

  return tokens;
}

function activityTokensInText(value: string, validTokens: Set<string>) {
  return Array.from(value.matchAll(/\bACTIVITY_\d+\b/g))
    .map((match) => match[0])
    .filter((token) => validTokens.has(token));
}

function inlineSegmentsFromTextAndTokens(
  rawText: unknown,
  rawTokens: unknown,
  validTokens: Set<string>,
) {
  const sourceText = typeof rawText === "string" ? rawText : "";
  const seen = new Set<string>();
  const segments: StructuredInline[] = [];
  let cursor = 0;

  function pushText(value: string) {
    if (segments.length >= maxInlineSegments) {
      return;
    }

    const text = cleanText(value);

    if (text) {
      segments.push({ type: "text", text });
    }
  }

  function pushActivity(token: string) {
    if (
      segments.length >= maxInlineSegments ||
      !validTokens.has(token) ||
      seen.has(token)
    ) {
      return;
    }

    seen.add(token);
    segments.push({ type: "activity", token });
  }

  for (const match of sourceText.matchAll(/\bACTIVITY_\d+\b/g)) {
    const token = match[0];
    const index = match.index ?? cursor;

    pushText(sourceText.slice(cursor, index));
    pushActivity(token);
    cursor = index + token.length;
  }

  pushText(sourceText.slice(cursor));

  for (const token of normalizeActivityTokens(rawTokens, validTokens)) {
    pushActivity(token);
  }

  return segments;
}

function normalizeInlineSegments(
  value: unknown,
  validTokens: Set<string>,
): StructuredInline[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((rawSegment): StructuredInline[] => {
      if (
        !rawSegment ||
        typeof rawSegment !== "object" ||
        Array.isArray(rawSegment)
      ) {
        return [];
      }

      const segment = rawSegment as Record<string, unknown>;

      if (segment.type === "activity") {
        const token = normalizeActivityToken(segment.token, validTokens);

        return token ? [{ type: "activity", token }] : [];
      }

      if (segment.type !== "text" || typeof segment.text !== "string") {
        return [];
      }

      const text = cleanText(segment.text);

      return text ? [{ type: "text", text }] : [];
    })
    .slice(0, maxInlineSegments);
}

function inlineText(segments: StructuredInline[]) {
  return segments.some((segment) => segment.type === "text" && segment.text);
}

function inlineActivityReferences(
  segments: StructuredInline[],
  referencesByToken: Map<string, ActivityReference>,
) {
  return segments
    .filter((segment) => segment.type === "activity")
    .map((segment) => referencesByToken.get(segment.token))
    .filter((reference): reference is ActivityReference => Boolean(reference));
}

function isBlockersSection(heading: string) {
  const normalized = heading.trim().toLowerCase();

  return normalized === "blocker" || normalized === "blockers";
}

function inlineHasActivityReference(
  segments: StructuredInline[],
  referencesByToken: Map<string, ActivityReference>,
) {
  return inlineActivityReferences(segments, referencesByToken).length > 0;
}

function normalizeReferencedBlockerBlock(
  block: StructuredBlock,
  referencesByToken: Map<string, ActivityReference>,
) {
  if (block.type === "paragraph" || block.type === "blockquote") {
    return inlineHasActivityReference(block.segments, referencesByToken)
      ? block
      : null;
  }

  if (block.type === "bulletedList" || block.type === "numberedList") {
    const items = block.items.filter((item) =>
      inlineHasActivityReference(item.segments, referencesByToken),
    );

    return items.length > 0 ? { ...block, items } : null;
  }

  return null;
}

function normalizeBlockerReferences(
  section: StructuredSection,
  referencesByToken: Map<string, ActivityReference>,
) {
  if (!isBlockersSection(section.heading)) {
    return section;
  }

  const blocks = section.blocks
    .map((block) => normalizeReferencedBlockerBlock(block, referencesByToken))
    .filter((block): block is StructuredBlock => Boolean(block));

  return blocks.length > 0 ? { ...section, blocks } : null;
}

function normalizeBlock(
  value: unknown,
  validTokens: Set<string>,
): StructuredBlock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const block = value as Record<string, unknown>;

  if (block.type === "paragraph" || block.type === "blockquote") {
    const segments = Array.isArray(block.segments)
      ? normalizeInlineSegments(block.segments, validTokens)
      : inlineSegmentsFromTextAndTokens(
          block.text,
          block.activityTokens,
          validTokens,
        );

    return inlineText(segments) ? { type: block.type, segments } : null;
  }

  if (block.type === "bulletedList" || block.type === "numberedList") {
    const items = Array.isArray(block.items)
      ? block.items
          .flatMap((rawItem): Array<{ segments: StructuredInline[] }> => {
            if (
              !rawItem ||
              typeof rawItem !== "object" ||
              Array.isArray(rawItem)
            ) {
              return [];
            }

            const item = rawItem as Record<string, unknown>;
            const segments = Array.isArray(item.segments)
              ? normalizeInlineSegments(item.segments, validTokens)
              : inlineSegmentsFromTextAndTokens(
                  item.text,
                  item.activityTokens,
                  validTokens,
                );

            return inlineText(segments) ? [{ segments }] : [];
          })
          .slice(0, maxListItems)
      : [];

    return items.length > 0 ? { type: block.type, items } : null;
  }

  return null;
}

function normalizeStructuredSummary(
  response: GenerateContentResponse,
  references: ActivityReference[],
) {
  if (responseReachedTokenLimit(response)) {
    return null;
  }

  const parsed = parseJsonObject(responseText(response));
  const rawSections = Array.isArray(parsed?.sections) ? parsed.sections : [];
  const validTokens = new Set(references.map((reference) => reference.token));
  const referencesByToken = new Map(
    references.map((reference) => [reference.token, reference]),
  );
  const sections = rawSections
    .flatMap((rawSection): StructuredSection[] => {
      if (
        !rawSection ||
        typeof rawSection !== "object" ||
        Array.isArray(rawSection)
      ) {
        return [];
      }

      const section = rawSection as Record<string, unknown>;
      const heading =
        typeof section.heading === "string"
          ? cleanText(section.heading, 80)
          : "";
      const rawBlocks = Array.isArray(section.blocks) ? section.blocks : [];
      const blocks = rawBlocks
        .map((block) => normalizeBlock(block, validTokens))
        .filter((block): block is StructuredBlock => Boolean(block))
        .slice(0, maxBlocksPerSection);

      return heading && blocks.length > 0 ? [{ heading, blocks }] : [];
    })
    .map((section) => normalizeBlockerReferences(section, referencesByToken))
    .filter((section): section is StructuredSection => Boolean(section))
    .slice(0, maxSections);

  return sections.length > 0 ? sections : null;
}

function renderInline(
  segments: StructuredInline[],
  referencesByToken: Map<string, ActivityReference>,
) {
  const parts = segments
    .map((segment) =>
      segment.type === "activity"
        ? referencesByToken.get(segment.token)?.markdown ?? ""
        : segment.text,
    )
    .filter(Boolean);

  return parts
    .join(" ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function renderBlock(
  block: StructuredBlock,
  referencesByToken: Map<string, ActivityReference>,
) {
  if (block.type === "paragraph") {
    return renderInline(block.segments, referencesByToken);
  }

  if (block.type === "blockquote") {
    const line = renderInline(block.segments, referencesByToken);

    return line ? `> ${line}` : "";
  }

  if (block.type === "bulletedList" || block.type === "numberedList") {
    return block.items
      .map((item, index) => {
        const line = renderInline(item.segments, referencesByToken);

        if (!line) {
          return "";
        }

        return block.type === "numberedList"
          ? `${index + 1}. ${line}`
          : `- ${line}`;
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function renderStructuredSummary(
  sections: StructuredSection[],
  references: ActivityReference[],
) {
  const referencesByToken = new Map(
    references.map((reference) => [reference.token, reference]),
  );
  const chunks = sections.flatMap((section) => {
    const blocks = section.blocks
      .map((block) => renderBlock(block, referencesByToken))
      .filter(Boolean);

    return blocks.length > 0 ? [`## ${section.heading}`, ...blocks, ""] : [];
  });

  return chunks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function generateStructuredSummary(
  userId: string,
  report: SummaryReport,
  references: ActivityReference[],
) {
  const ai = await getGeminiClient(userId);

  for (const compact of [false, true]) {
    const result = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: buildSummaryPrompt(report, references, compact),
      config: {
        maxOutputTokens: compact ? 2400 : 6000,
        responseMimeType: "application/json",
        thinkingConfig: {
          thinkingBudget: 0,
        },
        temperature: compact ? 0 : 0.1,
        topP: 0.8,
      },
    });
    const sections = normalizeStructuredSummary(result, references);

    if (sections) {
      return sections;
    }
  }

  throw new HttpError(502, "Unable to summarize with AI. Try again.");
}

export async function generateDailyReportSummaryWithAI(
  userId: string,
  report: SummaryReport,
) {
  const references = report.activities
    .filter((activity) => activity.selected && !activity.staleAt)
    .slice(0, maxPromptActivities)
    .map(activityReference)
    .filter((reference): reference is ActivityReference => Boolean(reference));

  if (references.length === 0) {
    throw new HttpError(400, "Select at least one work item before summarizing with AI.");
  }

  const sections = await generateStructuredSummary(userId, report, references);
  const summary = renderStructuredSummary(sections, references);

  if (!summary) {
    throw new HttpError(502, "Unable to summarize with AI. Try again.");
  }

  return { summary };
}
