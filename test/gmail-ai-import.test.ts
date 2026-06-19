import { beforeEach, describe, expect, it, vi } from "vitest";

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
  decodeGmailBody,
  dedupeGmailActivities,
  extractGmailActivitiesWithAI,
  extractGmailMessageText,
  gmailThreadEvidence,
} from "@/lib/services/gmail-ai-import";

function encoded(value: string) {
  return Buffer.from(value).toString("base64url");
}

function response(items: unknown[]) {
  return {
    text: JSON.stringify({ items }),
    candidates: [{ finishReason: "STOP" }],
  };
}

const start = new Date("2026-05-14T04:00:00.000Z");
const end = new Date("2026-05-15T04:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  getGeminiClientMock.mockResolvedValue({
    models: {
      generateContent: generateContentMock,
    },
  });
});

describe("Gmail AI import helpers", () => {
  it("decodes Gmail base64url body data", () => {
    expect(decodeGmailBody(encoded("Hello Gmail"))).toBe("Hello Gmail");
  });

  it("extracts plain text from nested message parts before html", () => {
    const text = extractGmailMessageText({
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/html",
          body: { data: encoded("<p>HTML body</p>") },
        },
        {
          mimeType: "multipart/mixed",
          parts: [
            {
              mimeType: "text/plain",
              body: { data: encoded("Plain body") },
            },
          ],
        },
      ],
    });

    expect(text).toBe("Plain body");
  });

  it("falls back to stripped html and handles empty payloads", () => {
    expect(
      extractGmailMessageText({
        mimeType: "text/html",
        body: { data: encoded("<p>Worked on <strong>launch</strong></p>") },
      }),
    ).toBe("Worked on launch");
    expect(extractGmailMessageText(undefined)).toBe("");
  });

  it("builds same-day thread evidence from Gmail threads", () => {
    const evidence = gmailThreadEvidence(
      {
        id: "thread-1",
        messages: [
          {
            id: "message-1",
            threadId: "thread-1",
            internalDate: String(new Date("2026-05-14T14:00:00.000Z").getTime()),
            payload: {
              headers: [
                { name: "Subject", value: "Launch follow-up" },
                { name: "From", value: "Employee <employee@generisgp.com>" },
                { name: "To", value: "Client <client@example.com>" },
              ],
              parts: [
                {
                  mimeType: "text/plain",
                  body: { data: encoded("Sent launch follow-up.") },
                },
              ],
            },
          },
          {
            id: "message-old",
            threadId: "thread-1",
            internalDate: String(new Date("2026-05-13T14:00:00.000Z").getTime()),
            payload: {
              parts: [
                {
                  mimeType: "text/plain",
                  body: { data: encoded("Old context") },
                },
              ],
            },
          },
        ],
      },
      start,
      end,
    );

    expect(evidence?.messages).toHaveLength(1);
    expect(evidence?.messages[0]).toMatchObject({
      id: "message-1",
      subject: "Launch follow-up",
      senderDomains: ["generisgp.com"],
      recipientDomains: ["example.com"],
    });
  });

  it("normalizes AI candidates without storing raw Gmail body text", async () => {
    const rawBodyText = "SECRET RAW BODY SHOULD NOT BE STORED";
    generateContentMock.mockResolvedValue(
      response([
        {
          threadId: "thread-1",
          messageIds: ["message-1"],
          title: "Completed client launch follow-up",
          description: "Prepared the client launch follow-up.",
          status: "complete",
          confidence: 0.9,
          reason: rawBodyText,
          startedAt: "2026-05-14T14:00:00.000Z",
        },
        {
          threadId: "thread-1",
          messageIds: ["message-1"],
          title: "Low confidence item",
          confidence: 0.4,
          reason: "follow_up",
        },
        {
          threadId: "thread-1",
          messageIds: ["unknown-message"],
          title: "Unknown provenance",
          confidence: 0.95,
          reason: "follow_up",
        },
        {
          threadId: "thread-1",
          messageIds: ["message-1"],
          title: "Task completed",
          confidence: 0.95,
          reason: "work_performed",
        },
      ]),
    );

    const activities = await extractGmailActivitiesWithAI(
      "user-1",
      "2026-05-14",
      [
        {
          threadId: "thread-1",
          subject: "Launch follow-up",
          messages: [
            {
              id: "message-1",
              threadId: "thread-1",
              date: new Date("2026-05-14T14:00:00.000Z"),
              subject: "Launch follow-up",
              text: rawBodyText,
              senderDomains: ["generisgp.com"],
              recipientDomains: ["example.com"],
            },
          ],
        },
      ],
      start,
      end,
    );

    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      source: "GMAIL",
      selected: true,
      title: "Completed client launch follow-up",
      status: "complete",
      sourceContainerId: "thread-1",
    });
    expect(JSON.stringify(activities[0].metadata)).not.toContain(rawBodyText);
    expect(activities[0].metadata).toEqual(
      expect.objectContaining({
        confidence: 0.9,
        reason: "work_performed",
        messageIds: ["message-1"],
      }),
    );
  });

  it("scrubs verbatim body excerpts and email addresses from generated fields", async () => {
    const rawDescription =
      "Prepared the client launch follow-up for stakeholder review.";
    const rawTitle = "Exact raw title copied from the email body";
    const rawUnreferencedReply =
      "Client confirmed the launch plan and readiness details.";
    generateContentMock.mockResolvedValue(
      response([
        {
          threadId: "thread-1",
          messageIds: ["message-1"],
          title: "Completed launch follow-up",
          description: `Follow-up: ${rawDescription}`,
          confidence: 0.9,
          reason: "work_performed",
        },
        {
          threadId: "thread-1",
          messageIds: ["message-2"],
          title: rawTitle,
          description: "Generated description",
          confidence: 0.9,
          reason: "work_performed",
        },
        {
          threadId: "thread-1",
          messageIds: ["message-3"],
          title: "Sent client note",
          description: "Contacted client@example.com about launch.",
          confidence: 0.9,
          reason: "follow_up",
        },
        {
          threadId: "thread-1",
          messageIds: ["message-3"],
          title: "Captured client launch confirmation",
          description: rawUnreferencedReply,
          confidence: 0.9,
          reason: "follow_up",
        },
      ]),
    );

    const activities = await extractGmailActivitiesWithAI(
      "user-1",
      "2026-05-14",
      [
        {
          threadId: "thread-1",
          subject: "Launch follow-up",
          messages: [
            {
              id: "message-1",
              threadId: "thread-1",
              date: new Date("2026-05-14T14:00:00.000Z"),
              subject: "Launch follow-up",
              text: rawDescription,
              senderDomains: ["generisgp.com"],
              recipientDomains: ["example.com"],
            },
            {
              id: "message-2",
              threadId: "thread-1",
              date: new Date("2026-05-14T15:00:00.000Z"),
              subject: "Launch follow-up",
              text: rawTitle,
              senderDomains: ["generisgp.com"],
              recipientDomains: ["example.com"],
            },
            {
              id: "message-3",
              threadId: "thread-1",
              date: new Date("2026-05-14T16:00:00.000Z"),
              subject: "Launch follow-up",
              text: "I contacted the client about launch details.",
              senderDomains: ["generisgp.com"],
              recipientDomains: ["example.com"],
            },
            {
              id: "message-4",
              threadId: "thread-1",
              date: new Date("2026-05-14T17:00:00.000Z"),
              subject: "Launch follow-up",
              text: rawUnreferencedReply,
              senderDomains: ["example.com"],
              recipientDomains: ["generisgp.com"],
            },
          ],
        },
      ],
      start,
      end,
    );

    expect(activities.map((activity) => activity.title)).toEqual([
      "Completed launch follow-up",
      "Sent client note",
      "Captured client launch confirmation",
    ]);
    expect(activities[0].description).toBeNull();
    expect(activities[1].description).toBe("Contacted about launch.");
    expect(activities[2].description).toBeNull();
    expect(JSON.stringify(activities)).not.toContain(rawDescription);
    expect(JSON.stringify(activities)).not.toContain(rawTitle);
    expect(JSON.stringify(activities)).not.toContain(rawUnreferencedReply);
    expect(JSON.stringify(activities)).not.toContain("client@example.com");
  });

  it("fails malformed AI responses instead of treating them as empty imports", async () => {
    generateContentMock.mockResolvedValue({
      text: "not json",
      candidates: [{ finishReason: "STOP" }],
    });

    await expect(
      extractGmailActivitiesWithAI(
        "user-1",
        "2026-05-14",
        [
          {
            threadId: "thread-1",
            subject: "Launch follow-up",
            messages: [
              {
                id: "message-1",
                threadId: "thread-1",
                date: new Date("2026-05-14T14:00:00.000Z"),
                subject: "Launch follow-up",
                text: "I prepared the launch follow-up.",
                senderDomains: ["generisgp.com"],
                recipientDomains: ["example.com"],
              },
            ],
          },
        ],
        start,
        end,
      ),
    ).rejects.toThrow("invalid response");
  });

  it("imports medium-confidence candidates unchecked", async () => {
    generateContentMock.mockResolvedValue(
      response([
        {
          threadId: "thread-1",
          messageIds: ["message-1"],
          title: "Followed up on content questions",
          description: "Followed up on open content questions.",
          confidence: 0.6,
          reason: "follow_up",
        },
      ]),
    );

    const activities = await extractGmailActivitiesWithAI(
      "user-1",
      "2026-05-14",
      [
        {
          threadId: "thread-1",
          subject: "Content questions",
          messages: [
            {
              id: "message-1",
              threadId: "thread-1",
              date: new Date("2026-05-14T14:00:00.000Z"),
              subject: "Content questions",
              text: "I followed up on the content questions.",
              senderDomains: ["generisgp.com"],
              recipientDomains: ["example.com"],
            },
          ],
        },
      ],
      start,
      end,
    );

    expect(activities[0]).toMatchObject({
      selected: false,
      status: "needs review",
      metadata: expect.objectContaining({ reviewRequired: true }),
    });
  });

  it("fails instead of returning partial items when a single-thread AI response is truncated", async () => {
    generateContentMock.mockResolvedValue({
      text: "",
      candidates: [{ finishReason: "MAX_TOKENS" }],
    });

    await expect(
      extractGmailActivitiesWithAI(
        "user-1",
        "2026-05-14",
        [
          {
            threadId: "thread-1",
            subject: "Content questions",
            messages: [
              {
                id: "message-1",
                threadId: "thread-1",
                date: new Date("2026-05-14T14:00:00.000Z"),
                subject: "Content questions",
                text: "I followed up on the content questions.",
                senderDomains: ["generisgp.com"],
                recipientDomains: ["example.com"],
              },
            ],
          },
        ],
        start,
        end,
      ),
    ).rejects.toThrow("AI response was truncated");
  });

  it("retries truncated multi-thread AI batches in smaller chunks", async () => {
    generateContentMock
      .mockResolvedValueOnce({
        text: "",
        candidates: [{ finishReason: "MAX_TOKENS" }],
      })
      .mockResolvedValueOnce(
        response([
          {
            threadId: "thread-1",
            messageIds: ["message-1"],
            title: "Completed first follow-up",
            confidence: 0.9,
            reason: "follow_up",
          },
        ]),
      )
      .mockResolvedValueOnce(
        response([
          {
            threadId: "thread-2",
            messageIds: ["message-2"],
            title: "Completed second follow-up",
            confidence: 0.9,
            reason: "follow_up",
          },
        ]),
      );

    const activities = await extractGmailActivitiesWithAI(
      "user-1",
      "2026-05-14",
      [
        {
          threadId: "thread-1",
          subject: "First follow-up",
          messages: [
            {
              id: "message-1",
              threadId: "thread-1",
              date: new Date("2026-05-14T14:00:00.000Z"),
              subject: "First follow-up",
              text: "I handled the first follow-up.",
              senderDomains: ["generisgp.com"],
              recipientDomains: ["example.com"],
            },
          ],
        },
        {
          threadId: "thread-2",
          subject: "Second follow-up",
          messages: [
            {
              id: "message-2",
              threadId: "thread-2",
              date: new Date("2026-05-14T15:00:00.000Z"),
              subject: "Second follow-up",
              text: "I handled the second follow-up.",
              senderDomains: ["generisgp.com"],
              recipientDomains: ["example.com"],
            },
          ],
        },
      ],
      start,
      end,
    );

    expect(generateContentMock).toHaveBeenCalledTimes(3);
    expect(activities.map((activity) => activity.title)).toEqual([
      "Completed first follow-up",
      "Completed second follow-up",
    ]);
  });

  it("splits oversized Gmail threads before sending AI prompts", async () => {
    generateContentMock.mockResolvedValue(response([]));

    await extractGmailActivitiesWithAI(
      "user-1",
      "2026-05-14",
      [
        {
          threadId: "thread-1",
          subject: "Large client thread",
          messages: Array.from({ length: 24 }, (_, index) => ({
            id: `message-${index + 1}`,
            threadId: "thread-1",
            date: new Date(`2026-05-14T14:${String(index).padStart(2, "0")}:00.000Z`),
            subject: "Large client thread",
            text: `Handled client follow-up ${index + 1}. ${"Details ".repeat(220)}`,
            senderDomains: ["generisgp.com"],
            recipientDomains: ["example.com"],
          })),
        },
      ],
      start,
      end,
    );

    expect(generateContentMock.mock.calls.length).toBeGreaterThan(1);
    for (const [call] of generateContentMock.mock.calls) {
      expect(call.contents.length).toBeLessThanOrEqual(22_000);
    }
  });

  it("dedupes Gmail candidates against Jira keys and same-thread titles", () => {
    const activities = dedupeGmailActivities(
      [
        {
          source: "GMAIL",
          sourceId: "gmail-1",
          sourceContainerId: "thread-1",
          title: "Updated IT-4100 rollout status",
        },
        {
          source: "GMAIL",
          sourceId: "gmail-2",
          sourceContainerId: "thread-2",
          title: "Prepared client response",
        },
        {
          source: "GMAIL",
          sourceId: "gmail-3",
          sourceContainerId: "thread-2",
          title: "Prepared client response!",
        },
        {
          source: "GMAIL",
          sourceId: "gmail-4",
          sourceContainerId: "thread-task",
          title: "Followed up on task status",
          description: null,
          metadata: {
            messageIds: ["message-task"],
          },
        },
        {
          source: "GMAIL",
          sourceId: "gmail-5",
          sourceContainerId: "thread-jira",
          title: "Updated rollout status",
          description: null,
          metadata: {
            messageIds: ["message-jira"],
          },
        },
      ],
      [
        {
          source: "JIRA",
          sourceId: "jira-1",
          sourceUrl: null,
          title: "IT-4100: Rollout status",
          description: null,
        },
        {
          source: "GOOGLE_TASKS",
          sourceId: "task-1",
          sourceUrl: "https://tasks.google.com/task/1",
          title: "Task status",
          description: null,
        },
      ],
      [
        {
          threadId: "thread-task",
          subject: "Task status",
          messages: [
            {
              id: "message-task",
              threadId: "thread-task",
              date: new Date("2026-05-14T14:00:00.000Z"),
              subject: "Task status",
              text: "Please see https://tasks.google.com/task/1 for the task.",
              senderDomains: ["generisgp.com"],
              recipientDomains: ["example.com"],
            },
          ],
        },
        {
          threadId: "thread-jira",
          subject: "Rollout status",
          messages: [
            {
              id: "message-jira",
              threadId: "thread-jira",
              date: new Date("2026-05-14T15:00:00.000Z"),
              subject: "Rollout status",
              text: "I updated IT-4100 with the latest rollout status.",
              senderDomains: ["generisgp.com"],
              recipientDomains: ["example.com"],
            },
          ],
        },
      ],
    );

    expect(activities.map((activity) => activity.sourceId)).toEqual(["gmail-2"]);
  });

  it("does not suppress Gmail candidates with stale Jira or task matches", () => {
    const activities = dedupeGmailActivities(
      [
        {
          source: "GMAIL",
          sourceId: "gmail-stale-jira",
          sourceContainerId: "thread-stale-jira",
          title: "Updated rollout status",
          description: null,
          metadata: {
            messageIds: ["message-stale-jira"],
          },
        },
        {
          source: "GMAIL",
          sourceId: "gmail-stale-task",
          sourceContainerId: "thread-stale-task",
          title: "Followed up on task status",
          description: null,
          metadata: {
            messageIds: ["message-stale-task"],
          },
        },
      ],
      [
        {
          source: "JIRA",
          sourceId: "jira-stale",
          sourceUrl: null,
          title: "IT-5000: Old stale issue",
          description: null,
          staleAt: new Date("2026-05-13T00:00:00.000Z"),
        },
        {
          source: "GOOGLE_TASKS",
          sourceId: "task-stale",
          sourceUrl: "https://tasks.google.com/task/stale",
          title: "Old stale task",
          description: null,
          staleAt: new Date("2026-05-13T00:00:00.000Z"),
        },
      ],
      [
        {
          threadId: "thread-stale-jira",
          subject: "Rollout status",
          messages: [
            {
              id: "message-stale-jira",
              threadId: "thread-stale-jira",
              date: new Date("2026-05-14T15:00:00.000Z"),
              subject: "Rollout status",
              text: "I updated IT-5000 with the latest rollout status.",
              senderDomains: ["generisgp.com"],
              recipientDomains: ["example.com"],
            },
          ],
        },
        {
          threadId: "thread-stale-task",
          subject: "Task status",
          messages: [
            {
              id: "message-stale-task",
              threadId: "thread-stale-task",
              date: new Date("2026-05-14T16:00:00.000Z"),
              subject: "Task status",
              text: "Please see https://tasks.google.com/task/stale for the task.",
              senderDomains: ["generisgp.com"],
              recipientDomains: ["example.com"],
            },
          ],
        },
      ],
    );

    expect(activities.map((activity) => activity.sourceId)).toEqual([
      "gmail-stale-jira",
      "gmail-stale-task",
    ]);
  });

  it("reuses existing Gmail source ids when AI rewords the same evidence", () => {
    const activities = dedupeGmailActivities(
      [
        {
          source: "GMAIL",
          sourceId: "thread:thread-1:candidate:new-title-hash",
          sourceContainerId: "thread-1",
          title: "Prepared client rollout response",
          metadata: {
            threadId: "thread-1",
            messageIds: ["message-1", "message-2"],
          },
        },
      ],
      [
        {
          source: "GMAIL",
          sourceId: "thread:thread-1:candidate:old-title-hash",
          sourceContainerId: "thread-1",
          sourceUrl: "https://mail.google.com/mail/u/0/#all/thread-1",
          title: "Drafted client rollout reply",
          description: null,
          staleAt: new Date("2026-05-13T00:00:00.000Z"),
          metadata: {
            threadId: "thread-1",
            messageIds: ["message-2", "message-1"],
          },
        },
      ],
    );

    expect(activities).toEqual([
      expect.objectContaining({
        sourceId: "thread:thread-1:candidate:old-title-hash",
        title: "Prepared client rollout response",
      }),
    ]);
  });
});
