import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NormalizedActivity } from "@/lib/normalizers";

const { generateContentMock, getGeminiClientMock, getGeminiModelMock } =
  vi.hoisted(() => ({
    generateContentMock: vi.fn(),
    getGeminiClientMock: vi.fn(),
    getGeminiModelMock: vi.fn(() => "gemini-test"),
  }));

vi.mock("@/lib/integrations/gemini", () => ({
  getGeminiClient: getGeminiClientMock,
  getGeminiModel: getGeminiModelMock,
}));

import {
  dedupeGoogleChatActivities,
  extractGoogleChatActivitiesWithAI,
  extractGoogleChatMessageText,
  googleChatConversationEvidence,
} from "@/lib/services/google-chat-ai-import";

function response(items: unknown[]) {
  return {
    text: JSON.stringify({ items }),
    candidates: [{ finishReason: "STOP" }],
  };
}

const start = new Date("2026-05-14T04:00:00.000Z");
const end = new Date("2026-05-15T04:00:00.000Z");
const space = {
  name: "spaces/AAA",
  displayName: "Product",
  spaceUri: "https://chat.google.com/room/AAA",
};
const currentUserNames = new Set(["users/current"]);

beforeEach(() => {
  vi.clearAllMocks();
  getGeminiClientMock.mockResolvedValue({
    models: {
      generateContent: generateContentMock,
    },
  });
});

describe("Google Chat AI import helpers", () => {
  it("extracts Chat message text and strips formatted fallbacks", () => {
    expect(
      extractGoogleChatMessageText({
        formattedText: "<b>Reviewed</b> launch checklist",
      }),
    ).toBe("Reviewed launch checklist");
    expect(extractGoogleChatMessageText({})).toBe("");
  });

  it("builds same-day conversation evidence grouped by thread", () => {
    const conversations = googleChatConversationEvidence(
      space,
      [
        {
          name: "spaces/AAA/messages/msg-1",
          createTime: "2026-05-14T14:00:00.000Z",
          text: "Finished the launch checklist.",
          sender: { name: "users/current", type: "HUMAN" },
          thread: { name: "spaces/AAA/threads/thread-1" },
        },
        {
          name: "spaces/AAA/messages/msg-2",
          createTime: "2026-05-14T14:05:00.000Z",
          text: "Shared QA notes for review.",
          sender: { name: "users/coworker", type: "HUMAN" },
          thread: { name: "spaces/AAA/threads/thread-1" },
        },
        {
          name: "spaces/AAA/messages/msg-bot",
          createTime: "2026-05-14T14:07:00.000Z",
          text: "Created a task with a full issue status card.",
          sender: { name: "users/app", type: "BOT" },
          thread: { name: "spaces/AAA/threads/thread-1" },
        },
        {
          name: "spaces/AAA/messages/msg-3",
          createTime: "2026-05-14T14:15:00.000Z",
          text: "Coworker-only work should stay out.",
          sender: { name: "users/coworker", type: "HUMAN" },
          thread: { name: "spaces/AAA/threads/thread-2" },
        },
        {
          name: "spaces/AAA/messages/msg-old",
          createTime: "2026-05-13T14:00:00.000Z",
          text: "Yesterday.",
        },
        {
          name: "spaces/AAA/messages/msg-deleted",
          createTime: "2026-05-14T14:10:00.000Z",
          text: "Deleted.",
          deleteTime: "2026-05-14T14:11:00.000Z",
        },
      ],
      start,
      end,
      currentUserNames,
    );

    expect(conversations).toEqual([
      expect.objectContaining({
        conversationId: "spaces/AAA/threads/thread-1",
        spaceDisplayName: "Product",
        spaceUri: "https://chat.google.com/room/AAA",
        messages: [
          expect.objectContaining({
            id: "spaces/AAA/messages/msg-1",
            isCurrentUser: true,
          }),
          expect.objectContaining({
            id: "spaces/AAA/messages/msg-2",
            isCurrentUser: false,
          }),
        ],
      }),
    ]);
  });

  it("adds nearby context for unthreaded current-user Chat messages", () => {
    const conversations = googleChatConversationEvidence(
      space,
      [
        {
          name: "spaces/AAA/messages/msg-1",
          createTime: "2026-05-14T14:00:00.000Z",
          text: "Can you update the ESC26 delegate list before the review?",
          sender: { name: "users/coworker", type: "HUMAN" },
        },
        {
          name: "spaces/AAA/messages/msg-2",
          createTime: "2026-05-14T14:02:00.000Z",
          text: "Done, I updated it.",
          sender: { name: "users/current", type: "HUMAN" },
        },
        {
          name: "spaces/AAA/messages/msg-3",
          createTime: "2026-05-14T14:04:00.000Z",
          text: "Thanks, that works.",
          sender: { name: "users/coworker", type: "HUMAN" },
        },
      ],
      start,
      end,
      currentUserNames,
    );

    expect(conversations).toEqual([
      expect.objectContaining({
        conversationId: "spaces/AAA/messages/msg-2",
        contextType: "space_window",
        threadName: null,
        messages: [
          expect.objectContaining({
            id: "spaces/AAA/messages/msg-1",
            isCurrentUser: false,
          }),
          expect.objectContaining({
            id: "spaces/AAA/messages/msg-2",
            isCurrentUser: true,
          }),
          expect.objectContaining({
            id: "spaces/AAA/messages/msg-3",
            isCurrentUser: false,
          }),
        ],
      }),
    ]);
  });

  it("prompts Gemini with nearby unthreaded context for specific Chat titles", async () => {
    const conversations = googleChatConversationEvidence(
      space,
      [
        {
          name: "spaces/AAA/messages/msg-1",
          createTime: "2026-05-14T14:00:00.000Z",
          text: "Can you update the ESC26 delegate list before the review?",
          sender: { name: "users/coworker", type: "HUMAN" },
        },
        {
          name: "spaces/AAA/messages/msg-2",
          createTime: "2026-05-14T14:02:00.000Z",
          text: "Done, I updated it.",
          sender: { name: "users/current", type: "HUMAN" },
        },
      ],
      start,
      end,
      currentUserNames,
    );
    generateContentMock.mockResolvedValue(
      response([
        {
          conversationId: "spaces/AAA/messages/msg-2",
          messageIds: ["spaces/AAA/messages/msg-2"],
          title: "Update ESC26 delegate list",
          description: "Updated the delegate list for review.",
          confidence: 0.86,
          reason: "work_performed",
        },
      ]),
    );

    const activities = await extractGoogleChatActivitiesWithAI(
      "user-1",
      "2026-05-14",
      conversations,
      start,
      end,
    );

    const prompt = String(generateContentMock.mock.calls[0][0].contents);
    expect(prompt).toContain(
      "Context: nearby same-day messages in the same space",
    );
    expect(prompt).toContain(
      "Current-user message ids: spaces/AAA/messages/msg-2",
    );
    expect(prompt).toContain(
      "include those context message ids in messageIds too",
    );
    expect(prompt).toContain("Can you update the ESC26 delegate list");
    expect(prompt).toContain("bare acknowledgement");
    expect(activities.map((activity) => activity.title)).toEqual([
      "Update ESC26 delegate list",
    ]);
  });

  it("normalizes AI candidates without storing raw Chat body text", async () => {
    const conversations = googleChatConversationEvidence(
      space,
      [
        {
          name: "spaces/AAA/messages/msg-1",
          createTime: "2026-05-14T14:00:00.000Z",
          text: "I finished the launch checklist and sent QA notes.",
          sender: { name: "users/current", type: "HUMAN" },
          thread: { name: "spaces/AAA/threads/thread-1" },
        },
        {
          name: "spaces/AAA/messages/msg-2",
          createTime: "2026-05-14T15:00:00.000Z",
          text: "I coordinated rollout timing with the client.",
          sender: { name: "users/current", type: "HUMAN" },
          thread: { name: "spaces/AAA/threads/thread-2" },
        },
        {
          name: "spaces/AAA/messages/msg-3",
          createTime: "2026-05-14T15:10:00.000Z",
          text: "I finished a coworker-only task.",
          sender: { name: "users/coworker", type: "HUMAN" },
          thread: { name: "spaces/AAA/threads/thread-2" },
        },
      ],
      start,
      end,
      currentUserNames,
    );
    generateContentMock.mockResolvedValue(
      response([
        {
          conversationId: "spaces/AAA/threads/thread-1",
          messageIds: ["spaces/AAA/messages/msg-1"],
          title: "Advance launch review",
          description: "Prepared review material.",
          status: "noted",
          confidence: 0.82,
          reason: "deliverable",
          startedAt: "2026-05-14T14:00:00.000Z",
        },
        {
          conversationId: "spaces/AAA/threads/thread-2",
          messageIds: ["spaces/AAA/messages/msg-2"],
          title: "Coordinate rollout timing",
          description: "Aligned timing with the client.",
          confidence: 0.6,
          reason: "coordination",
        },
        {
          conversationId: "spaces/AAA/threads/thread-1",
          messageIds: ["spaces/AAA/messages/missing"],
          title: "Unknown message",
          confidence: 0.9,
          reason: "work_performed",
        },
        {
          conversationId: "spaces/AAA/threads/thread-1",
          messageIds: ["spaces/AAA/messages/msg-1"],
          title: "Low confidence",
          confidence: 0.49,
          reason: "work_performed",
        },
        {
          conversationId: "spaces/AAA/threads/thread-1",
          messageIds: ["spaces/AAA/messages/msg-1"],
          title: "I finished the launch checklist and sent QA notes.",
          confidence: 0.9,
          reason: "work_performed",
        },
        {
          conversationId: "spaces/AAA/threads/thread-2",
          messageIds: ["spaces/AAA/messages/msg-3"],
          title: "Coworker-only task",
          confidence: 0.9,
          reason: "work_performed",
        },
        {
          conversationId: "spaces/AAA/threads/thread-1",
          messageIds: ["spaces/AAA/messages/msg-1"],
          title: "Task completed",
          confidence: 0.9,
          reason: "work_performed",
        },
      ]),
    );

    const activities = await extractGoogleChatActivitiesWithAI(
      "user-1",
      "2026-05-14",
      conversations,
      start,
      end,
    );

    expect(activities).toEqual([
      expect.objectContaining({
        source: "GOOGLE_CHAT",
        title: "Advance launch review",
        selected: true,
        metadata: expect.objectContaining({
          importBatch: "google-chat-ai-v1",
          messageIds: ["spaces/AAA/messages/msg-1"],
          currentUserMessageIds: ["spaces/AAA/messages/msg-1"],
          confidence: 0.82,
          reviewRequired: false,
        }),
      }),
      expect.objectContaining({
        source: "GOOGLE_CHAT",
        title: "Coordinate rollout timing",
        selected: false,
        status: "needs review",
        metadata: expect.objectContaining({
          reviewRequired: true,
        }),
      }),
    ]);
    expect(JSON.stringify(activities)).not.toContain(
      "I finished the launch checklist and sent QA notes.",
    );
  });

  it("dedupes Chat candidates against Jira keys and same-conversation titles", () => {
    const conversations = googleChatConversationEvidence(
      space,
      [
        {
          name: "spaces/AAA/messages/msg-1",
          createTime: "2026-05-14T14:00:00.000Z",
          text: "Finished IT-5000 and shared QA notes.",
          sender: { name: "users/current" },
          thread: { name: "spaces/AAA/threads/thread-1" },
        },
        {
          name: "spaces/AAA/messages/msg-2",
          createTime: "2026-05-14T15:00:00.000Z",
          text: "Prepared rollout notes.",
          sender: { name: "users/current" },
          thread: { name: "spaces/AAA/threads/thread-2" },
        },
      ],
      start,
      end,
      currentUserNames,
    );
    const activities: NormalizedActivity[] = [
      {
        source: "GOOGLE_CHAT",
        sourceId: "chat-1",
        sourceContainerId: "spaces/AAA/threads/thread-1",
        title: "Finish IT-5000",
        description: null,
        sourceUrl: null,
        selected: true,
        metadata: { messageIds: ["spaces/AAA/messages/msg-1"] },
      },
      {
        source: "GOOGLE_CHAT",
        sourceId: "chat-2",
        sourceContainerId: "spaces/AAA/threads/thread-2",
        title: "Prepare rollout notes",
        description: null,
        sourceUrl: null,
        selected: true,
        metadata: { messageIds: ["spaces/AAA/messages/msg-2"] },
      },
      {
        source: "GOOGLE_CHAT",
        sourceId: "chat-3",
        sourceContainerId: "spaces/AAA/threads/thread-2",
        title: "Prepare rollout notes",
        description: null,
        sourceUrl: null,
        selected: true,
        metadata: { messageIds: ["spaces/AAA/messages/msg-2"] },
      },
    ];

    expect(
      dedupeGoogleChatActivities(
        activities,
        [
          {
            source: "JIRA",
            sourceId: "jira-1",
            sourceUrl: "https://jira.example/browse/IT-5000",
            title: "IT-5000: Launch checklist",
            description: null,
            staleAt: null,
          },
        ],
        conversations,
      ).map((activity) => activity.sourceId),
    ).toEqual(["chat-2"]);
  });

  it("dedupes unthreaded Chat candidates against Jira keys in nearby context", () => {
    const conversations = googleChatConversationEvidence(
      space,
      [
        {
          name: "spaces/AAA/messages/msg-1",
          createTime: "2026-05-14T14:00:00.000Z",
          text: "Can you update IT-5000 before the review?",
          sender: { name: "users/coworker", type: "HUMAN" },
        },
        {
          name: "spaces/AAA/messages/msg-2",
          createTime: "2026-05-14T14:02:00.000Z",
          text: "Done, I updated it.",
          sender: { name: "users/current", type: "HUMAN" },
        },
      ],
      start,
      end,
      currentUserNames,
    );
    const activities: NormalizedActivity[] = [
      {
        source: "GOOGLE_CHAT",
        sourceId: "chat-context",
        sourceContainerId: "spaces/AAA/messages/msg-2",
        title: "Update review item",
        description: null,
        sourceUrl: null,
        selected: true,
        metadata: { messageIds: ["spaces/AAA/messages/msg-2"] },
      },
    ];

    expect(
      dedupeGoogleChatActivities(
        activities,
        [
          {
            source: "JIRA",
            sourceId: "jira-1",
            sourceUrl: "https://jira.example/browse/IT-5000",
            title: "IT-5000: Review item",
            description: null,
            staleAt: null,
          },
        ],
        conversations,
      ),
    ).toEqual([]);
  });
});
