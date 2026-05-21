import { revalidateTag, unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import type { companySettingsSchema } from "@/lib/validation";
import type { z } from "zod";

type CompanySettingsInput = z.infer<typeof companySettingsSchema>;

export type CompanySettings = {
  jiraProjectKeys: string[];
};

export const companySettingsCacheTag = "company-settings";

function normalizeCompanySettings(value: unknown): CompanySettings {
  const raw = value as { jiraProjectKeys?: unknown } | null | undefined;

  return {
    jiraProjectKeys: Array.isArray(raw?.jiraProjectKeys)
      ? raw.jiraProjectKeys
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : []
  };
}

async function readCompanySettings() {
  const setting = await prisma.appSetting.findUnique({ where: { key: "company" } });
  return normalizeCompanySettings(setting?.value);
}

const getCachedCompanySettings = unstable_cache(
  readCompanySettings,
  ["company-settings"],
  {
    revalidate: 300,
    tags: [companySettingsCacheTag]
  }
);

export async function getCompanySettings() {
  try {
    return await getCachedCompanySettings();
  } catch (error) {
    if (error instanceof Error && error.message.includes("incrementalCache missing")) {
      return readCompanySettings();
    }

    throw error;
  }
}

export async function saveCompanySettings(input: CompanySettingsInput) {
  const setting = await prisma.appSetting.upsert({
    where: { key: "company" },
    update: { value: input },
    create: { key: "company", value: input }
  });

  revalidateTag(companySettingsCacheTag);

  return normalizeCompanySettings(setting.value);
}
