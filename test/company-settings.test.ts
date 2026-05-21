import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAppSettingFindUnique } = vi.hoisted(() => ({
  mockAppSettingFindUnique: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (callback: unknown) => callback
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: mockAppSettingFindUnique,
      upsert: vi.fn()
    }
  }
}));

describe("company settings service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppSettingFindUnique.mockResolvedValue(null);
  });

  it("normalizes legacy Jira project filters before caching", async () => {
    mockAppSettingFindUnique.mockResolvedValue({
      value: {
        jiraProjectKeys: ["GEN", null, 42, "", "  ", " ops "]
      }
    });

    const { getCompanySettings } = await import("@/lib/services/company-settings");

    await expect(getCompanySettings()).resolves.toEqual({
      jiraProjectKeys: ["GEN", "ops"]
    });
  });
});
