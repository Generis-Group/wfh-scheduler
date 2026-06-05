import "server-only";

import { GoogleGenAI } from "@google/genai";

import { getOptionalEnv } from "@/lib/env";
import { getGoogleClient } from "@/lib/integrations/google";
import { GEMINI_OAUTH_SCOPES } from "@/lib/oauth-scopes";

const defaultGeminiModel = "gemini-2.5-flash";

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || defaultGeminiModel;
}

function getGeminiQuotaProject() {
  const quotaProjectId = getOptionalEnv("GOOGLE_CLOUD_QUOTA_PROJECT") ?? getOptionalEnv("GOOGLE_CLOUD_PROJECT");

  if (!quotaProjectId) {
    throw new Error("GOOGLE_CLOUD_QUOTA_PROJECT or GOOGLE_CLOUD_PROJECT is required for Gemini OAuth requests.");
  }

  return quotaProjectId;
}

export async function getGeminiClient(userId: string) {
  const authClient = await getGoogleClient(userId);
  const quotaProjectId = getGeminiQuotaProject();

  authClient.quotaProjectId = quotaProjectId;

  return new GoogleGenAI({
    googleAuthOptions: {
      authClient,
      scopes: [...GEMINI_OAUTH_SCOPES]
    }
  });
}
