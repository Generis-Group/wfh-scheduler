import { createHash } from "crypto";

import type { gmail_v1 } from "googleapis";

import { HttpError } from "@/lib/http";
import { getGeminiClient, getGeminiModel } from "@/lib/integrations/gemini";
import type { NormalizedActivity } from "@/lib/normalizers";

type GenerateContentResponse = {
  text?: unknown;
  candidates?: Array<{ finishReason?: unknown }>;
};

export type GmailMessageEvidence = {
  id: string;
  threadId: string;
  date: Date;
  subject: string | null;
  text: string;
  senderDomains: string[];
  recipientDomains: string[];
};

export type GmailThreadEvidence = {
  threadId: string;
  subject: string | null;
  messages: GmailMessageEvidence[];
};

type GmailExtractionItem = {
  threadId: string;
  messageIds: string[];
  title: string;
  description: string | null;
  status: string | null;
  confidence: number;
  reason: GmailImportReason;
  startedAt: Date;
};

type ExistingActivityForDedupe = {
  source: string;
  sourceId: string | null;
  sourceContainerId?: string | null;
  sourceUrl: string | null;
  title: string;
  description: string | null;
  metadata?: unknown;
  staleAt?: Date | string | null;
};

type GmailImportReason =
  | "work_performed"
  | "deliverable"
  | "follow_up"
  | "decision"
  | "coordination"
  | "blocker";

const maxPromptChars = 22000;
const maxThreadsPerBatch = 8;
const maxMessageTextLength = 1800;
const maxExtractedTitleLength = 160;
const maxExtractedDescriptionLength = 360;
const maxExtractedStatusLength = 80;
const maxExtractedReasonLength = 40;
const minLeakCheckChars = 18;
const minLeakCheckWords = 4;
const selectedConfidenceThreshold = 0.75;
const minimumConfidenceThreshold = 0.5;
const allowedReasons = new Set<GmailImportReason>([
  "work_performed",
  "deliverable",
  "follow_up",
  "decision",
  "coordination",
  "blocker",
]);

function truncate(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, Math.max(0, maxLength - 1)).trim()}...`
    : value;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, " ")
    .replace(/[<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? truncate(cleaned, maxLength) : null;
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function decodeGmailBody(data?: string | null) {
  if (!data) {
    return "";
  }

  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );

    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function collectBodyParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  mimeType: string,
): string[] {
  if (!part) {
    return [];
  }

  const current =
    !part.filename && part.mimeType === mimeType
      ? [decodeGmailBody(part.body?.data)]
      : [];
  const children = (part.parts ?? []).flatMap((child) =>
    collectBodyParts(child, mimeType),
  );

  return [...current, ...children].filter((text) => text.trim().length > 0);
}

export function extractGmailMessageText(
  payload?: gmail_v1.Schema$MessagePart,
) {
  const plain = collectBodyParts(payload, "text/plain").join("\n\n");
  const html = collectBodyParts(payload, "text/html").map(stripHtml).join("\n\n");
  const source = plain || html || decodeGmailBody(payload?.body?.data);
  const cleaned = source
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return truncate(cleaned, maxMessageTextLength);
}

function headerValue(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
) {
  return (
    headers?.find(
      (header) => header.name?.toLowerCase() === name.toLowerCase(),
    )?.value ?? null
  );
}

function domainsFromHeader(value?: string | null) {
  if (!value) {
    return [];
  }

  return Array.from(value.matchAll(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g))
    .map((match) => match[1].toLowerCase())
    .filter((domain, index, domains) => domains.indexOf(domain) === index)
    .slice(0, 8);
}

function messageDate(message: gmail_v1.Schema$Message) {
  if (message.internalDate) {
    const date = new Date(Number(message.internalDate));

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const dateHeader = headerValue(message.payload?.headers, "Date");

  if (dateHeader) {
    const date = new Date(dateHeader);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

function isWithinDay(date: Date, start: Date, end: Date) {
  return date >= start && date < end;
}

function messageEvidence(
  message: gmail_v1.Schema$Message,
  start: Date,
  end: Date,
): GmailMessageEvidence | null {
  if (!message.id || !message.threadId) {
    return null;
  }

  const date = messageDate(message);

  if (!date || !isWithinDay(date, start, end)) {
    return null;
  }

  const text = extractGmailMessageText(message.payload);

  if (!text) {
    return null;
  }

  const headers = message.payload?.headers;

  return {
    id: message.id,
    threadId: message.threadId,
    date,
    subject: cleanText(headerValue(headers, "Subject"), 180),
    text,
    senderDomains: domainsFromHeader(headerValue(headers, "From")),
    recipientDomains: [
      ...domainsFromHeader(headerValue(headers, "To")),
      ...domainsFromHeader(headerValue(headers, "Cc")),
    ]
      .filter((domain, index, domains) => domains.indexOf(domain) === index)
      .slice(0, 8),
  };
}

export function gmailThreadEvidence(
  thread: gmail_v1.Schema$Thread,
  start: Date,
  end: Date,
): GmailThreadEvidence | null {
  if (!thread.id) {
    return null;
  }

  const messages = (thread.messages ?? [])
    .map((message) => messageEvidence(message, start, end))
    .filter((item): item is GmailMessageEvidence => Boolean(item));

  if (messages.length === 0) {
    return null;
  }

  return {
    threadId: thread.id,
    subject: messages.find((message) => message.subject)?.subject ?? null,
    messages,
  };
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

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return match ? match[1].trim() : trimmed;
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

function parseExtractionResponse(response: GenerateContentResponse) {
  const parsed = parseJsonObject(responseText(response));

  if (!parsed || !Array.isArray(parsed.items)) {
    throw new HttpError(
      502,
      "Gmail AI import returned an invalid response. Try again.",
    );
  }

  return parsed.items;
}

function parsedConfidence(value: unknown) {
  const confidence =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (Number.isNaN(confidence)) {
    return 0;
  }

  return Math.min(1, Math.max(0, confidence));
}

function parsedReason(value: unknown): GmailImportReason {
  const reason = cleanText(value, maxExtractedReasonLength);

  return reason && allowedReasons.has(reason as GmailImportReason)
    ? (reason as GmailImportReason)
    : "work_performed";
}

function parseStartedAt(value: unknown, start: Date, end: Date) {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  return !Number.isNaN(date.getTime()) && isWithinDay(date, start, end)
    ? date
    : null;
}

function earliestMessageDate(messages: GmailMessageEvidence[]) {
  return messages.reduce(
    (earliest, message) =>
      message.date < earliest ? message.date : earliest,
    messages[0].date,
  );
}

function latestMessageDate(messages: GmailMessageEvidence[]) {
  return messages.reduce(
    (latest, message) => (message.date > latest ? message.date : latest),
    messages[0].date,
  );
}

function normalizeExtractionItems(
  response: GenerateContentResponse,
  threads: GmailThreadEvidence[],
  start: Date,
  end: Date,
) {
  const rawItems = parseExtractionResponse(response);
  const threadsById = threadEvidenceById(threads);
  const seen = new Set<string>();
  const items: GmailExtractionItem[] = [];

  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      continue;
    }

    const item = rawItem as Record<string, unknown>;
    const threadId = typeof item.threadId === "string" ? item.threadId : "";
    const thread = threadsById.get(threadId);

    if (!thread) {
      continue;
    }

    const validMessageIds = new Set(
      thread.messages.map((message) => message.id),
    );
    const messageIds = Array.isArray(item.messageIds)
      ? item.messageIds
          .filter((id): id is string => typeof id === "string")
          .filter((id) => validMessageIds.has(id))
      : [];
    const uniqueMessageIds = [...new Set(messageIds)];

    if (uniqueMessageIds.length === 0) {
      continue;
    }

    const confidence = parsedConfidence(item.confidence);

    if (confidence < minimumConfidenceThreshold) {
      continue;
    }

    const title = cleanText(item.title, maxExtractedTitleLength);

    if (!title) {
      continue;
    }

    const dedupeKey = `${threadId}:${title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    const referencedMessages = thread.messages.filter((message) =>
      uniqueMessageIds.includes(message.id),
    );

    items.push({
      threadId,
      messageIds: uniqueMessageIds,
      title,
      description: cleanText(item.description, maxExtractedDescriptionLength),
      status: cleanText(item.status, maxExtractedStatusLength),
      confidence,
      reason: parsedReason(item.reason),
      startedAt:
        parseStartedAt(item.startedAt, start, end) ??
        earliestMessageDate(referencedMessages),
    });
  }

  return items;
}

function threadPromptBlock(thread: GmailThreadEvidence) {
  const lines = [
    `THREAD ${thread.threadId}`,
    thread.subject ? `Subject: ${thread.subject}` : null,
    ...thread.messages.map((message, index) =>
      [
        `Message ${index + 1}: id=${message.id}`,
        `date=${message.date.toISOString()}`,
        message.senderDomains.length
          ? `fromDomains=${message.senderDomains.join(",")}`
          : null,
        message.recipientDomains.length
          ? `toDomains=${message.recipientDomains.join(",")}`
          : null,
        "text:",
        message.text,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ];

  return lines.filter(Boolean).join("\n");
}

function buildExtractionPrompt(dateString: string, threads: GmailThreadEvidence[]) {
  return [
    "Extract daily report work items from Gmail evidence.",
    "Return JSON only.",
    'Use this exact shape: {"items":[{"threadId":"thread-id","messageIds":["message-id"],"title":"Short work item title","description":"Concise work evidence","status":"noted","confidence":0.75,"reason":"work_performed","startedAt":"2026-06-17T14:00:00.000Z"}]}',
    "",
    "Report-worthy items include actual work performed, deliverables, meaningful follow-ups, decisions, client/internal coordination with an outcome, or true blockers.",
    "Exclude newsletters, FYIs, automated mail, calendar notifications, small acknowledgements, pure scheduling chatter, personal content, and vague items.",
    "Use confidence 0 to 1. Use 0.75+ only when the email clearly shows reportable work.",
    "The reason must be one of: work_performed, deliverable, follow_up, decision, coordination, blocker.",
    "Do not quote email text. Do not include raw URLs, raw email addresses, markdown, HTML, or unknown message ids.",
    `Report date: ${dateString}`,
    "",
    "Gmail evidence:",
    threads.map(threadPromptBlock).join("\n\n---\n\n"),
  ].join("\n");
}

function extractionPromptLength(
  dateString: string,
  threads: GmailThreadEvidence[],
) {
  return buildExtractionPrompt(dateString, threads).length;
}

function splitThreadForPrompt(
  thread: GmailThreadEvidence,
  dateString: string,
) {
  if (extractionPromptLength(dateString, [thread]) <= maxPromptChars) {
    return [thread];
  }

  const chunks: GmailThreadEvidence[] = [];
  let messages: GmailMessageEvidence[] = [];

  for (const message of thread.messages) {
    const nextMessages = [...messages, message];
    const nextThread = { ...thread, messages: nextMessages };
    const nextPromptLength = extractionPromptLength(dateString, [nextThread]);

    if (messages.length === 0 && nextPromptLength > maxPromptChars) {
      let text = message.text;
      let clippedMessage = message;

      while (
        extractionPromptLength(dateString, [
          { ...thread, messages: [clippedMessage] },
        ]) > maxPromptChars &&
        text.length > 0
      ) {
        const promptLength = extractionPromptLength(dateString, [
          { ...thread, messages: [clippedMessage] },
        ]);
        const overage = promptLength - maxPromptChars;
        const nextLength = Math.max(0, text.length - overage - 16);
        text = text.slice(0, nextLength).trim();
        clippedMessage = {
          ...message,
          text: text ? `${text}...` : "",
        };
      }

      chunks.push({ ...thread, messages: [clippedMessage] });
      messages = [];
      continue;
    }

    if (
      messages.length > 0 &&
      nextPromptLength > maxPromptChars
    ) {
      chunks.push({ ...thread, messages });
      messages = [message];
      continue;
    }

    messages = nextMessages;
  }

  if (messages.length > 0) {
    chunks.push({ ...thread, messages });
  }

  return chunks;
}

function batchThreads(threads: GmailThreadEvidence[], dateString: string) {
  const batches: GmailThreadEvidence[][] = [];
  const promptThreads = threads.flatMap((thread) =>
    splitThreadForPrompt(thread, dateString),
  );
  let batch: GmailThreadEvidence[] = [];

  for (const thread of promptThreads) {
    const nextBatch = [...batch, thread];
    const shouldStartNext =
      batch.length > 0 &&
      (batch.length >= maxThreadsPerBatch ||
        extractionPromptLength(dateString, nextBatch) > maxPromptChars);

    if (shouldStartNext) {
      batches.push(batch);
      batch = [];
    }

    batch.push(thread);
  }

  if (batch.length > 0) {
    batches.push(batch);
  }

  return batches;
}

function threadEvidenceById(threads: GmailThreadEvidence[]) {
  const threadsById = new Map<string, GmailThreadEvidence>();

  for (const thread of threads) {
    const existing = threadsById.get(thread.threadId);

    if (!existing) {
      threadsById.set(thread.threadId, {
        ...thread,
        messages: [...thread.messages],
      });
      continue;
    }

    const existingMessageIds = new Set(
      existing.messages.map((message) => message.id),
    );
    const messages = [
      ...existing.messages,
      ...thread.messages.filter((message) => !existingMessageIds.has(message.id)),
    ];

    threadsById.set(thread.threadId, {
      threadId: thread.threadId,
      subject: existing.subject ?? thread.subject,
      messages,
    });
  }

  return threadsById;
}

function gmailThreadUrl(threadId: string) {
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}`;
}

function comparableText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isLikelyVerbatimBodyExcerpt(
  value: string,
  messages: GmailMessageEvidence[],
) {
  const comparableValue = comparableText(value);
  const valueWords = comparableValue.split(" ").filter(Boolean);

  if (
    comparableValue.length < minLeakCheckChars ||
    valueWords.length < minLeakCheckWords
  ) {
    return false;
  }

  return messages.some((message) => {
    const comparableBody = comparableText(message.text);

    if (comparableBody.includes(comparableValue)) {
      return true;
    }

    for (let startIndex = 0; startIndex < valueWords.length; startIndex += 1) {
      for (
        let endIndex = startIndex + minLeakCheckWords;
        endIndex <= valueWords.length;
        endIndex += 1
      ) {
        const span = valueWords.slice(startIndex, endIndex).join(" ");

        if (
          span.length >= minLeakCheckChars &&
          comparableBody.includes(span)
        ) {
          return true;
        }
      }
    }

    return false;
  });
}

function generatedFieldWithoutBodyLeak(
  value: string | null,
  messages: GmailMessageEvidence[],
) {
  if (!value) {
    return null;
  }

  return isLikelyVerbatimBodyExcerpt(value, messages) ? null : value;
}

function sourceIdForItem(item: GmailExtractionItem) {
  const hash = createHash("sha256")
    .update(
      `${item.threadId}|${item.title.toLowerCase()}|${[...item.messageIds].sort().join(",")}`,
    )
    .digest("hex")
    .slice(0, 16);

  return `thread:${item.threadId}:candidate:${hash}`;
}

function activityFromItem(
  item: GmailExtractionItem,
  threadsById: Map<string, GmailThreadEvidence>,
): NormalizedActivity | null {
  const thread = threadsById.get(item.threadId);

  if (!thread) {
    return null;
  }

  const referencedMessages = thread.messages.filter((message) =>
    item.messageIds.includes(message.id),
  );

  if (referencedMessages.length === 0) {
    return null;
  }

  const title = generatedFieldWithoutBodyLeak(item.title, thread.messages);

  if (!title) {
    return null;
  }

  const description = generatedFieldWithoutBodyLeak(
    item.description,
    thread.messages,
  );
  const status = generatedFieldWithoutBodyLeak(item.status, thread.messages);
  const selected = item.confidence >= selectedConfidenceThreshold;
  const senderDomains = [
    ...new Set(referencedMessages.flatMap((message) => message.senderDomains)),
  ].slice(0, 8);
  const recipientDomains = [
    ...new Set(referencedMessages.flatMap((message) => message.recipientDomains)),
  ].slice(0, 8);

  return {
    source: "GMAIL",
    sourceId: sourceIdForItem({ ...item, title }),
    sourceContainerId: item.threadId,
    title,
    description,
    status: status ?? (selected ? "noted" : "needs review"),
    sourceUrl: gmailThreadUrl(item.threadId),
    startedAt: item.startedAt,
    endedAt: latestMessageDate(referencedMessages),
    selected,
    metadata: {
      importBatch: "gmail-ai-v1",
      threadId: item.threadId,
      messageIds: item.messageIds,
      messageDates: referencedMessages.map((message) => message.date.toISOString()),
      senderDomains,
      recipientDomains,
      confidence: item.confidence,
      reason: item.reason,
      reviewRequired: !selected,
    },
  };
}

function jiraKeys(value: string) {
  return Array.from(value.matchAll(/\b[A-Z][A-Z0-9]+-\d+\b/g)).map(
    (match) => match[0],
  );
}

function activityText(activity: Pick<NormalizedActivity, "title" | "description">) {
  return [activity.title, activity.description].filter(Boolean).join(" ");
}

function activityMessageIds(activity: NormalizedActivity) {
  const messageIds = activity.metadata?.messageIds;

  return Array.isArray(messageIds)
    ? messageIds.filter((id): id is string => typeof id === "string")
    : [];
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function existingActivityMessageIds(activity: ExistingActivityForDedupe) {
  const messageIds = metadataRecord(activity.metadata)?.messageIds;

  return Array.isArray(messageIds)
    ? messageIds.filter((id): id is string => typeof id === "string")
    : [];
}

function messageIdsKey(messageIds: string[]) {
  return [...new Set(messageIds)].sort().join("\u0000");
}

function activityEvidenceKey(activity: NormalizedActivity) {
  const threadId =
    typeof activity.sourceContainerId === "string"
      ? activity.sourceContainerId
      : metadataRecord(activity.metadata)?.threadId;
  const messageKey = messageIdsKey(activityMessageIds(activity));

  return typeof threadId === "string" && messageKey
    ? `${threadId}\u0000${messageKey}`
    : null;
}

function existingActivityEvidenceKey(activity: ExistingActivityForDedupe) {
  const threadId =
    typeof activity.sourceContainerId === "string"
      ? activity.sourceContainerId
      : metadataRecord(activity.metadata)?.threadId;
  const messageKey = messageIdsKey(existingActivityMessageIds(activity));

  return typeof threadId === "string" && messageKey
    ? `${threadId}\u0000${messageKey}`
    : null;
}

function reconcileGmailSourceIds(
  activities: NormalizedActivity[],
  existingActivities: ExistingActivityForDedupe[],
) {
  const existingIdsByEvidenceKey = new Map<string, string[]>();
  const incomingCountsByEvidenceKey = new Map<string, number>();

  for (const activity of existingActivities) {
    if (activity.source !== "GMAIL" || !activity.sourceId) {
      continue;
    }

    const key = existingActivityEvidenceKey(activity);

    if (!key) {
      continue;
    }

    existingIdsByEvidenceKey.set(key, [
      ...(existingIdsByEvidenceKey.get(key) ?? []),
      activity.sourceId,
    ]);
  }

  for (const activity of activities) {
    const key = activity.source === "GMAIL" ? activityEvidenceKey(activity) : null;

    if (key) {
      incomingCountsByEvidenceKey.set(
        key,
        (incomingCountsByEvidenceKey.get(key) ?? 0) + 1,
      );
    }
  }

  return activities.map((activity) => {
    const key = activity.source === "GMAIL" ? activityEvidenceKey(activity) : null;
    const existingIds = key ? existingIdsByEvidenceKey.get(key) : null;

    if (
      key &&
      incomingCountsByEvidenceKey.get(key) === 1 &&
      existingIds?.length === 1
    ) {
      return {
        ...activity,
        sourceId: existingIds[0],
      };
    }

    return activity;
  });
}

function sourceTextForActivity(
  activity: NormalizedActivity,
  threadsById: Map<string, GmailThreadEvidence>,
) {
  const threadId =
    typeof activity.sourceContainerId === "string"
      ? activity.sourceContainerId
      : "";
  const messageIds = new Set(activityMessageIds(activity));
  const thread = threadsById.get(threadId);

  if (!thread || messageIds.size === 0) {
    return "";
  }

  return thread.messages
    .filter((message) => messageIds.has(message.id))
    .map((message) => message.text)
    .join(" ");
}

function normalizedComparableTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isActiveExistingActivity(activity: ExistingActivityForDedupe) {
  return activity.staleAt == null;
}

export function dedupeGmailActivities(
  activities: NormalizedActivity[],
  existingActivities: ExistingActivityForDedupe[],
  threads: GmailThreadEvidence[] = [],
) {
  const existingJiraKeys = new Set(
    existingActivities
      .filter(
        (activity) => activity.source === "JIRA" && isActiveExistingActivity(activity),
      )
      .flatMap((activity) => jiraKeys(activityText(activity))),
  );
  const existingGoogleTaskIds = new Set(
    existingActivities
      .filter(
        (activity) =>
          activity.source === "GOOGLE_TASKS" && isActiveExistingActivity(activity),
      )
      .flatMap((activity) => [activity.sourceId, activity.sourceUrl])
      .filter((value): value is string => Boolean(value)),
  );
  const seenThreadTitles = new Set<string>();
  const threadsById = threadEvidenceById(threads);
  const reconciledActivities = reconcileGmailSourceIds(
    activities,
    existingActivities,
  );

  return reconciledActivities.filter((activity) => {
    const text = activityText(activity);
    const evidenceText = sourceTextForActivity(activity, threadsById);

    if (
      jiraKeys(`${text} ${evidenceText}`).some((key) =>
        existingJiraKeys.has(key),
      )
    ) {
      return false;
    }

    if (
      [...existingGoogleTaskIds].some(
        (idOrUrl) => text.includes(idOrUrl) || evidenceText.includes(idOrUrl),
      )
    ) {
      return false;
    }

    const threadId =
      typeof activity.sourceContainerId === "string"
        ? activity.sourceContainerId
        : "";
    const threadTitleKey = `${threadId}:${normalizedComparableTitle(activity.title)}`;

    if (seenThreadTitles.has(threadTitleKey)) {
      return false;
    }

    seenThreadTitles.add(threadTitleKey);
    return true;
  });
}

export async function extractGmailActivitiesWithAI(
  userId: string,
  dateString: string,
  threads: GmailThreadEvidence[],
  start: Date,
  end: Date,
) {
  if (threads.length === 0) {
    return [];
  }

  const ai = await getGeminiClient(userId);
  const batches = batchThreads(threads, dateString);
  const items: GmailExtractionItem[] = [];

  async function extractBatch(
    batch: GmailThreadEvidence[],
  ): Promise<GmailExtractionItem[]> {
    const result = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: buildExtractionPrompt(dateString, batch),
      config: {
        maxOutputTokens: 4000,
        responseMimeType: "application/json",
        thinkingConfig: {
          thinkingBudget: 0,
        },
        temperature: 0,
        topP: 0.8,
      },
    });

    if (responseReachedTokenLimit(result as GenerateContentResponse)) {
      if (batch.length > 1) {
        const midpoint = Math.ceil(batch.length / 2);

        return [
          ...(await extractBatch(batch.slice(0, midpoint))),
          ...(await extractBatch(batch.slice(midpoint))),
        ];
      }

      throw new HttpError(
        502,
        "Gmail AI import could not classify all email evidence because the AI response was truncated. Try again.",
      );
    }

    return normalizeExtractionItems(
      result as GenerateContentResponse,
      batch,
      start,
      end,
    );
  }

  for (const batch of batches) {
    items.push(...(await extractBatch(batch)));
  }

  const threadsById = threadEvidenceById(threads);

  return items
    .map((item) => activityFromItem(item, threadsById))
    .filter((activity): activity is NormalizedActivity => Boolean(activity));
}
