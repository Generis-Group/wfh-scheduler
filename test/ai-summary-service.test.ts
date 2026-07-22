import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateContentMock, getGeminiClientMock, getGeminiModelMock } =
  vi.hoisted(() => ({
    generateContentMock: vi.fn(),
    getGeminiClientMock: vi.fn(),
    getGeminiModelMock: vi.fn(() => "gemini-test-model"),
  }));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/integrations/gemini", () => ({
  getGeminiClient: getGeminiClientMock,
  getGeminiModel: getGeminiModelMock,
  getGeminiThinkingConfig: () => ({ thinkingLevel: "low" }),
}));

import { generateDailyReportSummaryWithAI } from "@/lib/services/ai-summary";

const baseActivity = {
  description: null,
  durationMinutes: null,
  employeeNote: null,
  selected: true,
  sourceUrl: "#",
  startedAt: "2026-06-08T14:00:00.000Z",
  status: "Done",
};

const report = {
  reportDate: "2026-06-08",
  workLocation: "WFH",
  summary: "",
  activities: [
    {
      ...baseActivity,
      id: "task-1",
      source: "GOOGLE_TASKS",
      title: "AES26 production update",
      description: "Add a room emcee to the event site.",
    },
    {
      ...baseActivity,
      id: "jira-1",
      source: "JIRA",
      title: "IT-4111: Create a New Program",
      description: "Create the EFMS on-demand program.",
      durationMinutes: 60,
    },
    {
      ...baseActivity,
      id: "calendar-1",
      source: "GOOGLE_CALENDAR",
      title: "Discuss Daily Work Log",
      durationMinutes: 15,
    },
  ],
};

function response(sections: unknown) {
  return {
    candidates: [{ finishReason: "STOP" }],
    text: JSON.stringify({ sections }),
  };
}

describe("AI summary service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGeminiClientMock.mockResolvedValue({
      models: {
        generateContent: generateContentMock,
      },
    });
  });

  it("renders structured Gemini output as supported summary markdown", async () => {
    generateContentMock.mockResolvedValue(
      response([
        {
          heading: "Production Updates",
          blocks: [
            {
              type: "bulletedList",
              items: [
                {
                  text: "Completed a routine AES26 production update.",
                  activityTokens: ["ACTIVITY_1"],
                },
              ],
            },
          ],
        },
        {
          heading: "On-Demand Program Work",
          blocks: [
            {
              type: "paragraph",
              text: "Created the new EFMS on-demand program and treated it as major work.",
              activityTokens: ["ACTIVITY_2"],
            },
            {
              type: "numberedList",
              items: [
                {
                  text: "Reviewed the daily work log flow.",
                  activityTokens: ["ACTIVITY_3"],
                },
              ],
            },
          ],
        },
      ]),
    );

    const result = await generateDailyReportSummaryWithAI("user-1", report);

    expect(getGeminiClientMock).toHaveBeenCalledWith("user-1");
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-test-model",
        contents: expect.stringContaining("Grouping rules, in priority order:"),
        config: expect.objectContaining({
          thinkingConfig: { thinkingLevel: "low" },
          responseMimeType: "application/json",
        }),
      }),
    );
    expect(generateContentMock.mock.calls[0]?.[0].contents).toContain(
      "Blocker definition:",
    );
    expect(generateContentMock.mock.calls[0]?.[0].contents).toContain(
      "Completion wording:",
    );
    expect(generateContentMock.mock.calls[0]?.[0].contents).toContain(
      "Accuracy rules:",
    );
    expect(generateContentMock.mock.calls[0]?.[0].contents).not.toContain(
      "Current summary being replaced:",
    );
    expect(generateContentMock.mock.calls[0]?.[0].contents).toContain(
      '"activityTokens":["ACTIVITY_1"]',
    );
    expect(generateContentMock.mock.calls[0]?.[0].config).not.toHaveProperty(
      "responseJsonSchema",
    );
    expect(result.summary).toContain("## Production Updates");
    expect(result.summary).toContain(
      "- Completed a routine AES26 production update. [AES26 production update](https://generis.local/activity/task-1?source=GOOGLE_TASKS)",
    );
    expect(result.summary).toContain("## On-Demand Program Work");
    expect(result.summary).toContain(
      "Created the new EFMS on-demand program and treated it as major work. [IT-4111: Create a New Program](https://generis.local/activity/jira-1?source=JIRA)",
    );
    expect(result.summary).toContain(
      "1. Reviewed the daily work log flow. [Discuss Daily Work Log](https://generis.local/activity/calendar-1?source=GOOGLE_CALENDAR)",
    );
  });

  it("does not rewrite Gemini's contextual heading with a task title", async () => {
    generateContentMock.mockResolvedValue(
      response([
        {
          heading: "On-Demand Program Work",
          blocks: [
            {
              type: "paragraph",
              text: "Logged program creation work.",
              activityTokens: ["ACTIVITY_1"],
            },
          ],
        },
      ]),
    );

    const result = await generateDailyReportSummaryWithAI("user-1", {
      ...report,
      activities: [
        {
          ...baseActivity,
          id: "jira-program",
          source: "JIRA",
          title: "IT-4231: Create Program",
          description: "Logged 3 hours on this item.",
          durationMinutes: 180,
        },
      ],
    });

    expect(result.summary).toContain("## On-Demand Program Work");
    expect(result.summary).not.toContain("## Create Program");
    expect(result.summary).toContain(
      "Logged program creation work. [IT-4231: Create Program](https://generis.local/activity/jira-program?source=JIRA)",
    );
  });

  it("preserves sanitized contextual headings without hardcoded categories", async () => {
    generateContentMock.mockResolvedValue(
      response([
        {
          heading: "Daily Product Work",
          blocks: [
            {
              type: "bulletedList",
              items: [
                {
                  text: "Added a clear button to erase work items.",
                  activityTokens: ["ACTIVITY_1"],
                },
              ],
            },
          ],
        },
        {
          heading: "Project Execution",
          blocks: [
            {
              type: "paragraph",
              text: "Continued the reviewer location breakdown.",
              activityTokens: ["ACTIVITY_2"],
            },
          ],
        },
      ]),
    );

    const result = await generateDailyReportSummaryWithAI("user-1", {
      ...report,
      activities: [
        {
          ...baseActivity,
          id: "jira-clear",
          source: "JIRA",
          title: "IT-4298: Add clear button to erase work items",
        },
        {
          ...baseActivity,
          id: "jira-location",
          source: "JIRA",
          title: "IT-4300: Build reviewer work location breakdown",
          status: "In Progress",
        },
      ],
    });

    expect(result.summary).toContain("## Daily Product Work");
    expect(result.summary).toContain("## Project Execution");
    expect(result.summary).toContain(
      "Added a clear button to erase work items.",
    );
    expect(result.summary).toContain(
      "Continued the reviewer location breakdown.",
    );
  });

  it("keeps Feature Development for actual implementation work", async () => {
    generateContentMock.mockResolvedValue(
      response([
        {
          heading: "Feature Development",
          blocks: [
            {
              type: "paragraph",
              text: "Implemented persistence for the WFH calendar.",
              activityTokens: ["ACTIVITY_1"],
            },
          ],
        },
      ]),
    );

    const result = await generateDailyReportSummaryWithAI("user-1", {
      ...report,
      activities: [
        {
          ...baseActivity,
          id: "jira-wfh-calendar",
          source: "JIRA",
          title: "IT-4400: Add WFH calendar persistence",
          description: "Implemented saved monthly WFH calendar state.",
          status: "In Progress",
        },
      ],
    });

    expect(result.summary).toContain("## Feature Development");
    expect(result.summary).toContain(
      "Implemented persistence for the WFH calendar.",
    );
  });

  it("keeps a descriptive work-type heading when Gemini chooses one", async () => {
    generateContentMock.mockResolvedValue(
      response([
        {
          heading: "Bug Fixes",
          blocks: [
            {
              type: "bulletedList",
              items: [
                {
                  text: "Resolved an issue with missing and multiple H1 tags.",
                  activityTokens: ["ACTIVITY_1"],
                },
              ],
            },
          ],
        },
      ]),
    );

    const result = await generateDailyReportSummaryWithAI("user-1", {
      ...report,
      activities: [
        {
          ...baseActivity,
          id: "jira-h1",
          source: "JIRA",
          title: "IT-4239: Fix Missing and Multiple H1 Tags",
          description: "Corrected the missing and duplicate H1 tags.",
        },
      ],
    });

    expect(result.summary).toContain("## Bug Fixes");
    expect(result.summary).toContain(
      "Resolved an issue with missing and multiple H1 tags. [IT-4239: Fix Missing and Multiple H1 Tags](https://generis.local/activity/jira-h1?source=JIRA)",
    );
  });

  it("prompts Gemini to consolidate real workstreams without absorbing unrelated work", async () => {
    generateContentMock.mockResolvedValue(
      response([
        {
          heading: "Implementation Work",
          blocks: [
            {
              type: "paragraph",
              text: "Continued build work.",
              activityTokens: ["ACTIVITY_1"],
            },
          ],
        },
      ]),
    );

    await generateDailyReportSummaryWithAI("user-1", report);

    const contents = generateContentMock.mock.calls[0]?.[0].contents;

    expect(contents).toContain("Grouping rules, in priority order:");
    expect(contents).toContain(
      "put them in one section for that shared workstream",
    );
    expect(contents).toContain(
      "Do not split one shared workstream into separate sections",
    );
    expect(contents).toContain(
      "Never place an item under a named workstream unless its own title, description, or note supports that relationship",
    );
    expect(contents).toContain(
      "Use the fewest sections that remain accurate",
    );
    expect(contents).toContain(
      "every item fits its section",
    );
  });

  it("preserves inline activity token placement from text fields", async () => {
    generateContentMock.mockResolvedValue(
      response([
        {
          heading: "Daily Work Log",
          blocks: [
            {
              type: "paragraph",
              text: "Completed ACTIVITY_1 before moving into ACTIVITY_2.",
              activityTokens: ["ACTIVITY_1", "ACTIVITY_2"],
            },
          ],
        },
      ]),
    );

    const result = await generateDailyReportSummaryWithAI("user-1", report);

    expect(result.summary).toContain(
      "Completed [AES26 production update](https://generis.local/activity/task-1?source=GOOGLE_TASKS) before moving into [IT-4111: Create a New Program](https://generis.local/activity/jira-1?source=JIRA).",
    );
    expect(result.summary).not.toContain("Completed before moving into.");
  });

  it("prompts Gemini to group large routine production batches", async () => {
    const manyProductionActivities = Array.from({ length: 20 }, (_, index) => ({
      ...baseActivity,
      id: `task-${index + 1}`,
      source: "GOOGLE_TASKS",
      title: `Production update ${index + 1}`,
      description: `Routine event-site content change ${index + 1}.`,
    }));
    generateContentMock.mockResolvedValue(
      response([
        {
          heading: "Production Updates",
          blocks: [
            {
              type: "bulletedList",
              items: [
                {
                  segments: [
                    {
                      type: "text",
                      text: "Grouped the large batch of routine production updates by event and update type.",
                    },
                    { type: "activity", token: "ACTIVITY_1" },
                    { type: "activity", token: "ACTIVITY_2" },
                    { type: "activity", token: "ACTIVITY_3" },
                  ],
                },
              ],
            },
          ],
        },
      ]),
    );

    const result = await generateDailyReportSummaryWithAI("user-1", {
      ...report,
      activities: manyProductionActivities,
    });

    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.stringContaining(
          "Limits: use at most 5 sections and at most 8 items in any list.",
        ),
      }),
    );
    expect(result.summary).toContain("Grouped the large batch");
    expect(result.summary).toContain("Production update 1");
    expect(result.summary).toContain("Production update 2");
    expect(result.summary).toContain("Production update 3");
    expect(result.summary).not.toContain("Production update 20");
  });

  it("prompts Gemini to promote substantial Google Tasks out of routine production", async () => {
    generateContentMock.mockResolvedValue(
      response([
        {
          heading: "On-Demand Program Work",
          blocks: [
            {
              type: "bulletedList",
              items: [
                {
                  segments: [
                    {
                      type: "text",
                      text: "Highlighted the program creation task as substantial work.",
                    },
                    { type: "activity", token: "ACTIVITY_1" },
                  ],
                },
              ],
            },
          ],
        },
      ]),
    );

    const result = await generateDailyReportSummaryWithAI("user-1", {
      ...report,
      activities: [
        {
          ...baseActivity,
          id: "task-program",
          source: "GOOGLE_TASKS",
          title: "Create a new on-demand program",
          description:
            "Create the program, import sessions, and configure assets.",
        },
      ],
    });

    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.stringContaining(
          "Do not classify substantial feature creation, restructuring, imports, major data work, or unrelated technical work as production updates.",
        ),
      }),
    );
    expect(result.summary).toContain("## On-Demand Program Work");
    expect(result.summary).toContain(
      "[Create a new on-demand program](https://generis.local/activity/task-program?source=GOOGLE_TASKS)",
    );
  });

  it("prompts Gemini to use status-aware completion wording", async () => {
    generateContentMock.mockResolvedValue(
      response([
        {
          heading: "Implementation Work",
          blocks: [
            {
              type: "paragraph",
              text: "Continued the implementation work.",
              activityTokens: ["ACTIVITY_1"],
            },
          ],
        },
      ]),
    );

    const result = await generateDailyReportSummaryWithAI("user-1", {
      ...report,
      activities: [
        {
          ...baseActivity,
          id: "jira-progress",
          source: "JIRA",
          title: "IT-4105: Improve summary generation",
          description: "Implementation is still in progress.",
          status: "In Progress",
        },
      ],
    });

    expect(generateContentMock.mock.calls[0]?.[0].contents).toContain(
      "For in-progress, open, pending, review, testing, not done, or ambiguous work",
    );
    expect(generateContentMock.mock.calls[0]?.[0].contents).toContain(
      "status=In Progress",
    );
    expect(result.summary).toContain("Continued the implementation work.");
  });

  it("drops blocker text that has no activity reference", async () => {
    generateContentMock.mockResolvedValue(
      response([
        {
          heading: "Daily Work",
          blocks: [
            {
              type: "paragraph",
              text: "Continued the summary generation work.",
              activityTokens: ["ACTIVITY_1"],
            },
          ],
        },
        {
          heading: "Blockers",
          blocks: [
            {
              type: "paragraph",
              text: "Waiting on approval before the work can continue.",
              activityTokens: [],
            },
          ],
        },
      ]),
    );

    const result = await generateDailyReportSummaryWithAI("user-1", {
      ...report,
      activities: [
        {
          ...baseActivity,
          id: "jira-summary",
          source: "JIRA",
          title: "IT-4107: Improve summary generation",
          description: "Continued the summary generation work.",
          status: "In Progress",
        },
      ],
    });

    expect(result.summary).toContain("Continued the summary generation work.");
    expect(result.summary).not.toContain("## Blockers");
    expect(result.summary).not.toContain(
      "Waiting on approval before the work can continue.",
    );
  });

  it("keeps blocker sections with activity references", async () => {
    generateContentMock.mockResolvedValue(
      response([
        {
          heading: "Blockers",
          blocks: [
            {
              type: "blockquote",
              text: "Waiting on client approval before deployment can continue.",
              activityTokens: ["ACTIVITY_1"],
            },
          ],
        },
      ]),
    );

    const result = await generateDailyReportSummaryWithAI("user-1", {
      ...report,
      activities: [
        {
          ...baseActivity,
          id: "jira-blocked",
          source: "JIRA",
          title: "IT-5000: Deployment blocked by missing approval",
          description:
            "Waiting on client approval before deployment can continue.",
          status: "Blocked",
        },
      ],
    });

    expect(result.summary).toContain("## Blockers");
    expect(result.summary).toContain(
      "> Waiting on client approval before deployment can continue.",
    );
    expect(result.summary).toContain(
      "[IT-5000: Deployment blocked by missing approval](https://generis.local/activity/jira-blocked?source=JIRA)",
    );
  });

  it("omits empty no-blocker sections from generated output", async () => {
    generateContentMock.mockResolvedValue(
      response([
        {
          heading: "Daily Work",
          blocks: [
            {
              type: "paragraph",
              text: "Completed planned summary improvements.",
              activityTokens: ["ACTIVITY_1"],
            },
          ],
        },
        {
          heading: "Blockers",
          blocks: [
            {
              type: "paragraph",
              text: "No blockers.",
              activityTokens: [],
            },
          ],
        },
      ]),
    );

    const result = await generateDailyReportSummaryWithAI("user-1", {
      ...report,
      activities: [
        {
          ...baseActivity,
          id: "task-summary",
          source: "GOOGLE_TASKS",
          title: "Improve generated summary",
        },
      ],
    });

    expect(result.summary).not.toContain("## Blockers");
    expect(result.summary).not.toContain("No blockers");
  });

  it("sanitizes unsupported formatting and unknown activity tokens", async () => {
    generateContentMock.mockResolvedValue(
      response([
        {
          heading: "## <script>Unsafe</script> | Heading",
          blocks: [
            {
              type: "paragraph",
              segments: [
                {
                  type: "text",
                  text: "Reviewed [external link](https://example.com) https://example.com <b>markup</b> `code` | table ACTIVITY_99.",
                },
                { type: "activity", token: "ACTIVITY_99" },
                { type: "activity", token: "ACTIVITY_1" },
              ],
            },
          ],
        },
      ]),
    );

    const result = await generateDailyReportSummaryWithAI("user-1", report);

    expect(result.summary).toContain("## Unsafe Heading");
    expect(result.summary).toContain(
      "Reviewed external link markup code table.",
    );
    expect(result.summary).toContain(
      "[AES26 production update](https://generis.local/activity/task-1?source=GOOGLE_TASKS)",
    );
    expect(result.summary).not.toContain("https://example.com");
    expect(result.summary).not.toContain("ACTIVITY_99");
    expect(result.summary).not.toContain("<");
    expect(result.summary).not.toContain(">");
    expect(result.summary).not.toContain("|");
    expect(result.summary).not.toContain("`");
  });

  it("retries once when Gemini returns cut-off or unusable output", async () => {
    generateContentMock
      .mockResolvedValueOnce({
        candidates: [{ finishReason: "MAX_TOKENS" }],
        text: JSON.stringify({
          sections: [
            {
              heading: "Partial",
              blocks: [
                {
                  type: "paragraph",
                  segments: [{ type: "text", text: "Do not use this." }],
                },
              ],
            },
          ],
        }),
      })
      .mockResolvedValueOnce(
        response([
          {
            heading: "Daily Work Log",
            blocks: [
              {
                type: "paragraph",
                segments: [{ type: "text", text: "Used the retry result." }],
              },
            ],
          },
        ]),
      );

    const result = await generateDailyReportSummaryWithAI("user-1", report);

    expect(generateContentMock).toHaveBeenCalledTimes(2);
    expect(generateContentMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        config: expect.objectContaining({
          maxOutputTokens: 6000,
          thinkingConfig: { thinkingLevel: "low" },
        }),
      }),
    );
    expect(generateContentMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        config: expect.objectContaining({
          maxOutputTokens: 2400,
          thinkingConfig: { thinkingLevel: "low" },
        }),
      }),
    );
    expect(result.summary).toContain("Used the retry result.");
    expect(result.summary).not.toContain("Do not use this.");
  });

  it("does not return a low-quality fallback if Gemini remains unusable", async () => {
    generateContentMock
      .mockResolvedValueOnce({ text: "not json" })
      .mockResolvedValueOnce(response([]));

    await expect(
      generateDailyReportSummaryWithAI("user-1", report),
    ).rejects.toMatchObject({
      status: 502,
      message: "Unable to summarize with AI. Try again.",
    });
  });

  it("requires selected work items", async () => {
    await expect(
      generateDailyReportSummaryWithAI("user-1", {
        ...report,
        activities: report.activities.map((activity) => ({
          ...activity,
          selected: false,
        })),
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Select at least one work item before summarizing with AI.",
    });
    expect(getGeminiClientMock).not.toHaveBeenCalled();
  });
});
