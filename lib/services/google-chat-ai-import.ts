import { createHash } from "crypto";

import type { chat_v1 } from "googleapis";

import {
  metadataWithRelatedActivity,
  sourceLinkForActivity,
} from "@/lib/activity-source-links";
import { HttpError } from "@/lib/http";
import { getGeminiClient, getGeminiModel } from "@/lib/integrations/gemini";
import type { NormalizedActivity } from "@/lib/normalizers";
import {
  formatImportedActivityTitle,
  isDescriptiveImportedActivityTitle,
} from "@/lib/services/ai-import-quality";

type GenerateContentResponse = {
  text?: unknown;
  candidates?: Array<{ finishReason?: unknown }>;
};

export type GoogleChatMessageEvidence = {
  id: string;
  conversationId: string;
  spaceName: string;
  date: Date;
  text: string;
  isCurrentUser: boolean;
  senderType: string | null;
};

export type GoogleChatConversationEvidence = {
  conversationId: string;
  spaceName: string;
  spaceDisplayName: string | null;
  spaceUri: string | null;
  threadName: string | null;
  contextType?: "thread" | "space_window";
  messages: GoogleChatMessageEvidence[];
};

type GoogleChatExtractionItem = {
  conversationId: string;
  messageIds: string[];
  title: string;
  description: string | null;
  confidence: number;
  reason: GoogleChatImportReason;
  startedAt: Date;
};

type ExistingActivityForDedupe = {
  id?: string;
  source: string;
  sourceId: string | null;
  sourceContainerId?: string | null;
  sourceUrl: string | null;
  title: string;
  description: string | null;
  metadata?: unknown;
  staleAt?: Date | string | null;
};

type GoogleChatImportReason =
  | "work_performed"
  | "deliverable"
  | "follow_up"
  | "decision"
  | "coordination"
  | "blocker";

const maxPromptChars = 32000;
const maxConversationsPerBatch = 12;
const maxMessageTextLength = 2200;
const maxExtractedTitleLength = 160;
const maxExtractedDescriptionLength = 360;
const maxExtractedReasonLength = 40;
const minLeakCheckChars = 18;
const minLeakCheckWords = 4;
const unthreadedContextWindowMs = 30 * 60 * 1000;
const maxUnthreadedContextMessagesPerSide = 6;
const selectedConfidenceThreshold = 0.75;
const minimumConfidenceThreshold = 0.5;
const allowedReasons = new Set<GoogleChatImportReason>([
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

function normalizeHttpsUrl(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
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

export function extractGoogleChatMessageText(message: chat_v1.Schema$Message) {
  const source =
    message.text ||
    message.argumentText ||
    (message.formattedText ? stripHtml(message.formattedText) : "");
  const cleaned = source
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return truncate(cleaned, maxMessageTextLength);
}

function optionalDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function messageDate(message: chat_v1.Schema$Message) {
  return (
    optionalDate(message.createTime) ?? optionalDate(message.lastUpdateTime)
  );
}

function isWithinDay(date: Date, start: Date, end: Date) {
  return date >= start && date < end;
}

function conversationIdForMessage(message: chat_v1.Schema$Message) {
  return message.thread?.name ?? message.name ?? null;
}

function isThreadConversationId(spaceName: string, conversationId: string) {
  return conversationId.startsWith(`${spaceName}/threads/`);
}

function normalizedSenderName(value?: string | null) {
  const normalized = value?.trim().toLowerCase();

  return normalized?.startsWith("users/") ? normalized : null;
}

function isAutomatedMessage(message: chat_v1.Schema$Message) {
  const senderType = message.sender?.type?.trim().toUpperCase();

  return Boolean(senderType && senderType !== "HUMAN");
}

function messageEvidence(
  space: chat_v1.Schema$Space,
  message: chat_v1.Schema$Message,
  start: Date,
  end: Date,
  currentUserNames: Set<string>,
): GoogleChatMessageEvidence | null {
  if (!space.name || !message.name || message.deleteTime) {
    return null;
  }

  if (isAutomatedMessage(message)) {
    return null;
  }

  const date = messageDate(message);
  const conversationId = conversationIdForMessage(message);

  if (!date || !conversationId || !isWithinDay(date, start, end)) {
    return null;
  }

  const text = extractGoogleChatMessageText(message);

  if (!text) {
    return null;
  }

  return {
    id: message.name,
    conversationId,
    spaceName: space.name,
    date,
    text,
    isCurrentUser: currentUserNames.has(
      normalizedSenderName(message.sender?.name) ?? "",
    ),
    senderType: cleanText(message.sender?.type, 40),
  };
}

export function googleChatConversationEvidence(
  space: chat_v1.Schema$Space,
  messages: chat_v1.Schema$Message[],
  start: Date,
  end: Date,
  currentUserNames: Set<string> = new Set(["users/me"]),
): GoogleChatConversationEvidence[] {
  if (!space.name) {
    return [];
  }

  const evidenceMessages = messages
    .map((message) =>
      messageEvidence(space, message, start, end, currentUserNames),
    )
    .filter((item): item is GoogleChatMessageEvidence => Boolean(item))
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const threadedGroups = new Map<string, GoogleChatMessageEvidence[]>();
  const unthreadedMessages: GoogleChatMessageEvidence[] = [];

  for (const evidence of evidenceMessages) {
    if (isThreadConversationId(space.name, evidence.conversationId)) {
      threadedGroups.set(evidence.conversationId, [
        ...(threadedGroups.get(evidence.conversationId) ?? []),
        evidence,
      ]);
      continue;
    }

    unthreadedMessages.push(evidence);
  }

  const threadedConversations = [...threadedGroups.entries()]
    .filter(([, groupedMessages]) =>
      groupedMessages.some((message) => message.isCurrentUser),
    )
    .map(([conversationId, groupedMessages]) =>
      conversationFromMessages(space, conversationId, groupedMessages, "thread"),
    );

  return [
    ...threadedConversations,
    ...unthreadedContextConversations(space, unthreadedMessages),
  ].sort((left, right) => {
    const leftDate = left.messages[0]?.date.getTime() ?? 0;
    const rightDate = right.messages[0]?.date.getTime() ?? 0;

    return leftDate - rightDate;
  });
}

function conversationFromMessages(
  space: chat_v1.Schema$Space,
  conversationId: string,
  messages: GoogleChatMessageEvidence[],
  contextType: "thread" | "space_window",
): GoogleChatConversationEvidence {
  return {
    conversationId,
    spaceName: space.name!,
    spaceDisplayName: cleanText(space.displayName, 128),
    spaceUri: normalizeHttpsUrl(space.spaceUri),
    threadName: contextType === "thread" ? conversationId : null,
    contextType,
    messages: messages.sort(
      (left, right) => left.date.getTime() - right.date.getTime(),
    ),
  };
}

function unthreadedContextRange(
  messages: GoogleChatMessageEvidence[],
  anchorIndex: number,
) {
  const anchor = messages[anchorIndex];
  let rangeStart = anchorIndex;
  let rangeEnd = anchorIndex;

  while (
    rangeStart > 0 &&
    anchor.date.getTime() - messages[rangeStart - 1].date.getTime() <=
      unthreadedContextWindowMs &&
    anchorIndex - (rangeStart - 1) <= maxUnthreadedContextMessagesPerSide
  ) {
    rangeStart -= 1;
  }

  while (
    rangeEnd < messages.length - 1 &&
    messages[rangeEnd + 1].date.getTime() - anchor.date.getTime() <=
      unthreadedContextWindowMs &&
    rangeEnd + 1 - anchorIndex <= maxUnthreadedContextMessagesPerSide
  ) {
    rangeEnd += 1;
  }

  return { start: rangeStart, end: rangeEnd };
}

function unthreadedContextConversations(
  space: chat_v1.Schema$Space,
  messages: GoogleChatMessageEvidence[],
) {
  const ranges = messages
    .map((message, index) =>
      message.isCurrentUser ? unthreadedContextRange(messages, index) : null,
    )
    .filter((range): range is { start: number; end: number } =>
      Boolean(range),
    );
  const mergedRanges: Array<{ start: number; end: number }> = [];

  for (const range of ranges) {
    const previous = mergedRanges.at(-1);

    if (previous && range.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, range.end);
      continue;
    }

    mergedRanges.push({ ...range });
  }

  return mergedRanges.map((range) => {
    const groupedMessages = messages.slice(range.start, range.end + 1);
    const anchor =
      groupedMessages.find((message) => message.isCurrentUser) ??
      groupedMessages[0];

    return conversationFromMessages(
      space,
      anchor.conversationId,
      groupedMessages,
      "space_window",
    );
  });
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
      "Google Chat AI import returned an invalid response. Try again.",
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

function parsedReason(value: unknown): GoogleChatImportReason {
  const reason = cleanText(value, maxExtractedReasonLength);

  return reason && allowedReasons.has(reason as GoogleChatImportReason)
    ? (reason as GoogleChatImportReason)
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

function earliestMessageDate(messages: GoogleChatMessageEvidence[]) {
  return messages.reduce(
    (earliest, message) => (message.date < earliest ? message.date : earliest),
    messages[0].date,
  );
}

function latestMessageDate(messages: GoogleChatMessageEvidence[]) {
  return messages.reduce(
    (latest, message) => (message.date > latest ? message.date : latest),
    messages[0].date,
  );
}

function conversationEvidenceById(
  conversations: GoogleChatConversationEvidence[],
) {
  const conversationsById = new Map<string, GoogleChatConversationEvidence>();

  for (const conversation of conversations) {
    const existing = conversationsById.get(conversation.conversationId);

    if (!existing) {
      conversationsById.set(conversation.conversationId, {
        ...conversation,
        messages: [...conversation.messages],
      });
      continue;
    }

    const existingMessageIds = new Set(
      existing.messages.map((message) => message.id),
    );
    const messages = [
      ...existing.messages,
      ...conversation.messages.filter(
        (message) => !existingMessageIds.has(message.id),
      ),
    ].sort((left, right) => left.date.getTime() - right.date.getTime());

    conversationsById.set(conversation.conversationId, {
      conversationId: conversation.conversationId,
      spaceName: existing.spaceName,
      spaceDisplayName:
        existing.spaceDisplayName ?? conversation.spaceDisplayName,
      spaceUri: existing.spaceUri ?? conversation.spaceUri,
      threadName: existing.threadName ?? conversation.threadName,
      messages,
    });
  }

  return conversationsById;
}

function normalizeExtractionItems(
  response: GenerateContentResponse,
  conversations: GoogleChatConversationEvidence[],
  start: Date,
  end: Date,
) {
  const rawItems = parseExtractionResponse(response);
  const conversationsById = conversationEvidenceById(conversations);
  const seen = new Set<string>();
  const items: GoogleChatExtractionItem[] = [];

  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      continue;
    }

    const item = rawItem as Record<string, unknown>;
    const conversationId =
      typeof item.conversationId === "string" ? item.conversationId : "";
    const conversation = conversationsById.get(conversationId);

    if (!conversation) {
      continue;
    }

    const validMessageIds = new Set(
      conversation.messages.map((message) => message.id),
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

    const title = formatImportedActivityTitle(
      cleanText(item.title, maxExtractedTitleLength),
    );

    if (!title || !isDescriptiveImportedActivityTitle(title)) {
      continue;
    }

    const dedupeKey = `${conversationId}:${title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    const referencedMessages = conversation.messages.filter((message) =>
      uniqueMessageIds.includes(message.id),
    );

    if (!referencedMessages.some((message) => message.isCurrentUser)) {
      continue;
    }

    seen.add(dedupeKey);
    items.push({
      conversationId,
      messageIds: uniqueMessageIds,
      title,
      description: cleanText(item.description, maxExtractedDescriptionLength),
      confidence,
      reason: parsedReason(item.reason),
      startedAt:
        parseStartedAt(item.startedAt, start, end) ??
        earliestMessageDate(referencedMessages),
    });
  }

  return items;
}

function conversationPromptBlock(conversation: GoogleChatConversationEvidence) {
  const currentUserMessageIds = conversation.messages
    .filter((message) => message.isCurrentUser)
    .map((message) => message.id);
  const lines = [
    `CONVERSATION ${conversation.conversationId}`,
    `Space: ${conversation.spaceDisplayName ?? conversation.spaceName}`,
    `Context: ${
      conversation.contextType === "space_window"
        ? "nearby same-day messages in the same space"
        : "same-thread replies"
    }`,
    currentUserMessageIds.length
      ? `Current-user message ids: ${currentUserMessageIds.join(", ")}`
      : null,
    ...conversation.messages.map((message, index) =>
      [
        `Message ${index + 1}: id=${message.id}`,
        `date=${message.date.toISOString()}`,
        message.isCurrentUser ? "author=current_user" : "author=other_user",
        message.senderType ? `senderType=${message.senderType}` : null,
        "text:",
        message.text,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ];

  return lines.filter(Boolean).join("\n");
}

function buildExtractionPrompt(
  dateString: string,
  conversations: GoogleChatConversationEvidence[],
) {
  return [
    "Extract daily report work items from Google Chat evidence.",
    "Return JSON only.",
    'Use this exact shape: {"items":[{"conversationId":"conversation-id","messageIds":["message-id"],"title":"Short work item title","description":"Concise work evidence","status":null,"confidence":0.75,"reason":"work_performed","startedAt":"2026-06-17T14:00:00.000Z"}]}',
    "",
    "Report-worthy items include actual work performed, deliverables, meaningful follow-ups, decisions, client/internal coordination with an outcome, or true blockers.",
    "Exclude small acknowledgements, FYIs, automated app noise, personal content, pure scheduling chatter, vague status chatter, and messages that only mention a task without evidence of work.",
    "Extract work only for messages marked author=current_user. Other-user messages are context only.",
    "Every item must reference at least one current_user message id.",
    "If other-user context is used to identify the task, include those context message ids in messageIds too.",
    "Use nearby other-user context to understand short current_user messages, but do not create an item from a bare acknowledgement such as noted, ok, thanks, or sounds good unless the current_user message also shows a concrete action, decision, or follow-up commitment.",
    "If a current_user message is short or ambiguous, use surrounding context to produce a specific task title. If the surrounding context still does not identify reportable work, omit it.",
    'Titles must be short, specific, and sentence case, like "Fix disappearing sponsor info" or "Update ESC26 delegate list". Preserve Jira keys, acronyms, product names, and event names. Do not use generic titles like "Task completed", "Work update", "Status update", or "Noted".',
    "Do not infer that a user created, completed, or blocked a task unless the Chat messages explicitly say so.",
    "Always return status:null. Do not assign completion, progress, or blocker statuses from Google Chat evidence.",
    "Use confidence 0 to 1. Use 0.75+ only when the messages clearly show reportable work.",
    "The reason must be one of: work_performed, deliverable, follow_up, decision, coordination, blocker.",
    "Do not quote chat text. Do not include raw URLs, raw email addresses, markdown, HTML, or unknown message ids.",
    `Report date: ${dateString}`,
    "",
    "Google Chat evidence:",
    conversations.map(conversationPromptBlock).join("\n\n---\n\n"),
  ].join("\n");
}

function extractionPromptLength(
  dateString: string,
  conversations: GoogleChatConversationEvidence[],
) {
  return buildExtractionPrompt(dateString, conversations).length;
}

function splitConversationForPrompt(
  conversation: GoogleChatConversationEvidence,
  dateString: string,
) {
  if (extractionPromptLength(dateString, [conversation]) <= maxPromptChars) {
    return [conversation];
  }

  const chunks: GoogleChatConversationEvidence[] = [];
  let messages: GoogleChatMessageEvidence[] = [];

  for (const message of conversation.messages) {
    const nextMessages = [...messages, message];
    const nextConversation = { ...conversation, messages: nextMessages };
    const nextPromptLength = extractionPromptLength(dateString, [
      nextConversation,
    ]);

    if (messages.length === 0 && nextPromptLength > maxPromptChars) {
      let text = message.text;
      let clippedMessage = message;

      while (
        extractionPromptLength(dateString, [
          { ...conversation, messages: [clippedMessage] },
        ]) > maxPromptChars &&
        text.length > 0
      ) {
        const promptLength = extractionPromptLength(dateString, [
          { ...conversation, messages: [clippedMessage] },
        ]);
        const overage = promptLength - maxPromptChars;
        const nextLength = Math.max(0, text.length - overage - 16);
        text = text.slice(0, nextLength).trim();
        clippedMessage = {
          ...message,
          text: text ? `${text}...` : "",
        };
      }

      chunks.push({ ...conversation, messages: [clippedMessage] });
      messages = [];
      continue;
    }

    if (messages.length > 0 && nextPromptLength > maxPromptChars) {
      chunks.push({ ...conversation, messages });
      messages = [message];
      continue;
    }

    messages = nextMessages;
  }

  if (messages.length > 0) {
    chunks.push({ ...conversation, messages });
  }

  return chunks;
}

function batchConversations(
  conversations: GoogleChatConversationEvidence[],
  dateString: string,
) {
  const batches: GoogleChatConversationEvidence[][] = [];
  const promptConversations = conversations.flatMap((conversation) =>
    splitConversationForPrompt(conversation, dateString),
  );
  let batch: GoogleChatConversationEvidence[] = [];

  for (const conversation of promptConversations) {
    const nextBatch = [...batch, conversation];
    const shouldStartNext =
      batch.length > 0 &&
      (batch.length >= maxConversationsPerBatch ||
        extractionPromptLength(dateString, nextBatch) > maxPromptChars);

    if (shouldStartNext) {
      batches.push(batch);
      batch = [];
    }

    batch.push(conversation);
  }

  if (batch.length > 0) {
    batches.push(batch);
  }

  return batches;
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
  messages: GoogleChatMessageEvidence[],
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

        if (span.length >= minLeakCheckChars && comparableBody.includes(span)) {
          return true;
        }
      }
    }

    return false;
  });
}

function generatedFieldWithoutBodyLeak(
  value: string | null,
  messages: GoogleChatMessageEvidence[],
) {
  if (!value) {
    return null;
  }

  return isLikelyVerbatimBodyExcerpt(value, messages) ? null : value;
}

function sourceIdForItem(item: GoogleChatExtractionItem) {
  const hash = createHash("sha256")
    .update(
      `${item.conversationId}|${item.title.toLowerCase()}|${[...item.messageIds].sort().join(",")}`,
    )
    .digest("hex")
    .slice(0, 16);

  return `chat:${item.conversationId}:candidate:${hash}`;
}

function activityFromItem(
  item: GoogleChatExtractionItem,
  conversationsById: Map<string, GoogleChatConversationEvidence>,
): NormalizedActivity | null {
  const conversation = conversationsById.get(item.conversationId);

  if (!conversation) {
    return null;
  }

  const referencedMessages = conversation.messages.filter((message) =>
    item.messageIds.includes(message.id),
  );

  if (referencedMessages.length === 0) {
    return null;
  }

  const title = formatImportedActivityTitle(
    generatedFieldWithoutBodyLeak(item.title, conversation.messages),
  );

  if (!title) {
    return null;
  }

  if (!isDescriptiveImportedActivityTitle(title)) {
    return null;
  }

  const description = generatedFieldWithoutBodyLeak(
    item.description,
    conversation.messages,
  );
  const selected = item.confidence >= selectedConfidenceThreshold;
  const senderTypes = [
    ...new Set(referencedMessages.map((message) => message.senderType)),
  ]
    .filter((value): value is string => Boolean(value))
    .slice(0, 8);

  return {
    source: "GOOGLE_CHAT",
    sourceId: sourceIdForItem({ ...item, title }),
    sourceContainerId: item.conversationId,
    title,
    description,
    status: null,
    sourceUrl: conversation.spaceUri,
    startedAt: item.startedAt,
    endedAt: latestMessageDate(referencedMessages),
    selected,
    metadata: {
      importBatch: "google-chat-ai-v1",
      conversationId: item.conversationId,
      spaceName: conversation.spaceName,
      spaceDisplayName: conversation.spaceDisplayName,
      threadName: conversation.threadName,
      messageIds: item.messageIds,
      currentUserMessageIds: referencedMessages
        .filter((message) => message.isCurrentUser)
        .map((message) => message.id),
      messageDates: referencedMessages.map((message) =>
        message.date.toISOString(),
      ),
      senderTypes,
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

function activityText(
  activity: Pick<NormalizedActivity, "title" | "description">,
) {
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
  const conversationId =
    typeof activity.sourceContainerId === "string"
      ? activity.sourceContainerId
      : metadataRecord(activity.metadata)?.conversationId;
  const messageKey = messageIdsKey(activityMessageIds(activity));

  return typeof conversationId === "string" && messageKey
    ? `${conversationId}\u0000${messageKey}`
    : null;
}

function existingActivityEvidenceKey(activity: ExistingActivityForDedupe) {
  const conversationId =
    typeof activity.sourceContainerId === "string"
      ? activity.sourceContainerId
      : metadataRecord(activity.metadata)?.conversationId;
  const messageKey = messageIdsKey(existingActivityMessageIds(activity));

  return typeof conversationId === "string" && messageKey
    ? `${conversationId}\u0000${messageKey}`
    : null;
}

function reconcileGoogleChatSourceIds(
  activities: NormalizedActivity[],
  existingActivities: ExistingActivityForDedupe[],
) {
  const existingIdsByEvidenceKey = new Map<string, string[]>();
  const incomingCountsByEvidenceKey = new Map<string, number>();

  for (const activity of existingActivities) {
    if (activity.source !== "GOOGLE_CHAT" || !activity.sourceId) {
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
    const key =
      activity.source === "GOOGLE_CHAT" ? activityEvidenceKey(activity) : null;

    if (key) {
      incomingCountsByEvidenceKey.set(
        key,
        (incomingCountsByEvidenceKey.get(key) ?? 0) + 1,
      );
    }
  }

  return activities.map((activity) => {
    const key =
      activity.source === "GOOGLE_CHAT" ? activityEvidenceKey(activity) : null;
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
  conversationsById: Map<string, GoogleChatConversationEvidence>,
) {
  const conversationId =
    typeof activity.sourceContainerId === "string"
      ? activity.sourceContainerId
      : "";
  const messageIds = new Set(activityMessageIds(activity));
  const conversation = conversationsById.get(conversationId);

  if (!conversation || messageIds.size === 0) {
    return "";
  }

  const referencedMessages = conversation.messages.filter((message) =>
    messageIds.has(message.id),
  );
  const messagesForDedupe =
    conversation.contextType === "space_window" &&
    !referencedMessages.some((message) => !message.isCurrentUser)
      ? conversation.messages
      : referencedMessages;

  return messagesForDedupe
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

function relatedActivityMetadata(
  activity: NormalizedActivity,
  relatedActivity: ExistingActivityForDedupe,
) {
  return relatedActivity.id
    ? metadataWithRelatedActivity(activity.metadata, relatedActivity.id, [
        sourceLinkForActivity(activity),
      ])
    : null;
}

export function dedupeGoogleChatActivities(
  activities: NormalizedActivity[],
  existingActivities: ExistingActivityForDedupe[],
  conversations: GoogleChatConversationEvidence[] = [],
) {
  const existingJiraByKey = new Map<string, ExistingActivityForDedupe>();
  const existingGoogleTaskByIdOrUrl = new Map<
    string,
    ExistingActivityForDedupe
  >();

  for (const activity of existingActivities) {
    if (!isActiveExistingActivity(activity)) {
      continue;
    }

    if (activity.source === "JIRA") {
      for (const key of jiraKeys(activityText(activity))) {
        if (!existingJiraByKey.has(key)) {
          existingJiraByKey.set(key, activity);
        }
      }
    }

    if (activity.source === "GOOGLE_TASKS") {
      for (const value of [activity.sourceId, activity.sourceUrl]) {
        if (value && !existingGoogleTaskByIdOrUrl.has(value)) {
          existingGoogleTaskByIdOrUrl.set(value, activity);
        }
      }
    }
  }

  const seenConversationTitles = new Set<string>();
  const conversationsById = conversationEvidenceById(conversations);
  const reconciledActivities = reconcileGoogleChatSourceIds(
    activities,
    existingActivities,
  );

  return reconciledActivities.flatMap((activity) => {
    const text = activityText(activity);
    const evidenceText = sourceTextForActivity(activity, conversationsById);
    const matchingJiraActivity = jiraKeys(`${text} ${evidenceText}`)
      .map((key) => existingJiraByKey.get(key))
      .find(
        (activity): activity is ExistingActivityForDedupe => Boolean(activity),
      );

    if (matchingJiraActivity) {
      const metadata = relatedActivityMetadata(activity, matchingJiraActivity);

      return metadata ? [{ ...activity, metadata }] : [];
    }

    const matchingGoogleTaskActivity = [
      ...existingGoogleTaskByIdOrUrl.entries(),
    ].find(
      ([idOrUrl]) => text.includes(idOrUrl) || evidenceText.includes(idOrUrl),
    )?.[1];

    if (matchingGoogleTaskActivity) {
      const metadata = relatedActivityMetadata(
        activity,
        matchingGoogleTaskActivity,
      );

      return metadata ? [{ ...activity, metadata }] : [];
    }

    const conversationId =
      typeof activity.sourceContainerId === "string"
        ? activity.sourceContainerId
        : "";
    const conversationTitleKey = `${conversationId}:${normalizedComparableTitle(activity.title)}`;

    if (seenConversationTitles.has(conversationTitleKey)) {
      return [];
    }

    seenConversationTitles.add(conversationTitleKey);
    return [activity];
  });
}

export async function extractGoogleChatActivitiesWithAI(
  userId: string,
  dateString: string,
  conversations: GoogleChatConversationEvidence[],
  start: Date,
  end: Date,
) {
  if (conversations.length === 0) {
    return [];
  }

  const ai = await getGeminiClient(userId);
  const batches = batchConversations(conversations, dateString);
  const items: GoogleChatExtractionItem[] = [];

  async function extractBatch(
    batch: GoogleChatConversationEvidence[],
  ): Promise<GoogleChatExtractionItem[]> {
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
        "Google Chat AI import could not classify all messages because the AI response was truncated. Try again.",
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

  const conversationsById = conversationEvidenceById(conversations);

  return items
    .map((item) => activityFromItem(item, conversationsById))
    .filter((activity): activity is NormalizedActivity => Boolean(activity));
}
