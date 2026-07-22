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

import { generateDepartmentReportSummaries } from "@/lib/services/department-report-summary";

const employee = {
  user: {
    name: "Alex Employee",
    email: "alex@example.com",
    departments: [
      {
        role: "EMPLOYEE",
        department: { name: "Operations" },
      },
    ],
  },
  reports: [
    {
      id: "report-1",
      reportDate: "2026-06-25",
      status: "SUBMITTED",
      summary:
        "Completed the main planning work and coordinated the next implementation steps.",
      activities: [
        {
          title: "Prepare launch checklist",
          employeeNote: "Aligned owners and deadlines",
          selected: true,
        },
      ],
    },
  ],
};

describe("department report AI summaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGeminiClientMock.mockResolvedValue({
      models: { generateContent: generateContentMock },
    });
  });

  it("generates a conversational daily department summary with a hard character limit", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ summary: "progress ".repeat(600) }),
    });

    const summaries = await generateDepartmentReportSummaries("reviewer-1", {
      period: "DAILY",
      startDate: "2026-06-25",
      endDate: "2026-06-25",
      employees: [employee],
    });

    expect(getGeminiClientMock).toHaveBeenCalledWith("reviewer-1");
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-test-model",
        contents: expect.stringContaining("Do not list every task separately"),
        config: expect.objectContaining({
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: "low" },
        }),
      }),
    );
    expect(generateContentMock.mock.calls[0][0].contents).toContain(
      "preserve useful concrete detail",
    );
    expect(generateContentMock.mock.calls[0][0].contents).toContain(
      "Mention a ticket identifier only in the rare case",
    );
    expect(generateContentMock.mock.calls[0][0].contents).toContain(
      "Prepare launch checklist (Aligned owners and deadlines)",
    );
    expect(summaries[0]).toMatchObject({
      department: "Operations",
      characterLimit: 2400,
      submittedReportCount: 1,
    });
    expect(summaries[0].summary?.length).toBeLessThanOrEqual(2400);
  });

  it("asks for a higher-level weekly synthesis instead of a day-by-day list", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        summary:
          "The team advanced its main implementation work and aligned on the next priorities.",
      }),
    });

    const summaries = await generateDepartmentReportSummaries("reviewer-1", {
      period: "WEEKLY",
      startDate: "2026-06-22",
      endDate: "2026-06-28",
      employees: [employee],
    });

    expect(generateContentMock.mock.calls[0][0].contents).toContain(
      "Do not narrate the week day by day",
    );
    expect(summaries[0]).toMatchObject({
      department: "Operations",
      characterLimit: 3600,
    });
  });

  it("summarizes a multi-department employee in each department separately", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ summary: "The team advanced its priorities." }),
    });
    const multiDepartmentEmployee = {
      ...employee,
      user: {
        ...employee.user,
        departments: [
          ...employee.user.departments,
          {
            role: "EMPLOYEE",
            department: { name: "Marketing" },
          },
        ],
      },
    };

    const summaries = await generateDepartmentReportSummaries("reviewer-1", {
      period: "DAILY",
      startDate: "2026-06-25",
      endDate: "2026-06-25",
      employees: [multiDepartmentEmployee],
    });

    expect(summaries.map((summary) => summary.department).sort()).toEqual([
      "Marketing",
      "Operations",
    ]);
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });
});
