import "server-only";

import { getOptionalEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { getGoogleClient } from "@/lib/integrations/google";
import { GEMINI_OAUTH_SCOPES } from "@/lib/oauth-scopes";

const defaultGeminiModel = "gemini-2.5-flash";
const geminiApiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";

type GeminiGenerateContentConfig = {
  maxOutputTokens?: number;
  responseJsonSchema?: unknown;
  responseMimeType?: string;
  thinkingConfig?: {
    thinkingBudget?: number;
  };
  temperature?: number;
  topP?: number;
};

type GeminiGenerateContentRequest = {
  model: string;
  contents: string;
  config?: GeminiGenerateContentConfig;
};

type GeminiTextPart = {
  text?: string;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiTextPart[];
    };
    finishReason?: string;
  }>;
};

type GoogleApiError = {
  message?: unknown;
  response?: {
    status?: unknown;
    data?: {
      error?: {
        message?: unknown;
      };
    };
  };
};

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || defaultGeminiModel;
}

function getGeminiQuotaProject() {
  const quotaProjectId =
    getOptionalEnv("GOOGLE_CLOUD_QUOTA_PROJECT") ??
    getOptionalEnv("GOOGLE_CLOUD_PROJECT");

  if (!quotaProjectId) {
    throw new HttpError(
      409,
      "Gemini is missing its Google Cloud project configuration. Set GOOGLE_CLOUD_QUOTA_PROJECT or GOOGLE_CLOUD_PROJECT, then try again.",
    );
  }

  return quotaProjectId;
}

function modelResourceName(model: string) {
  const trimmed = model.trim();

  return trimmed.startsWith("models/") ? trimmed : `models/${trimmed}`;
}

function generatedText(response: GeminiGenerateContentResponse) {
  return (
    response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("") ?? ""
  );
}

function googleApiErrorMessage(error: GoogleApiError) {
  const apiMessage = error.response?.data?.error?.message;

  if (typeof apiMessage === "string" && apiMessage.trim()) {
    return apiMessage.trim();
  }

  return typeof error.message === "string" ? error.message : "";
}

function geminiRequestError(error: unknown): HttpError {
  const googleError = error as GoogleApiError;
  const status =
    typeof googleError.response?.status === "number"
      ? googleError.response.status
      : 502;
  const detail = googleApiErrorMessage(googleError);

  if (status === 401) {
    return new HttpError(409, "Reconnect Google before using Gemini AI.");
  }

  if (
    status === 403 &&
    /insufficient authentication scopes|access_token_scope_insufficient/i.test(detail)
  ) {
    return new HttpError(409, "Reconnect Google before using Gemini AI.");
  }

  if (status === 403) {
    return new HttpError(
      403,
      detail
        ? `Gemini access was denied: ${detail}`
        : "Gemini access was denied. Check that the Gemini API is enabled and the signed-in Google account has access.",
    );
  }

  return new HttpError(
    status >= 400 && status < 600 ? status : 502,
    detail ? `Gemini request failed: ${detail}` : "Gemini request failed. Try again.",
  );
}

export async function getGeminiClient(userId: string) {
  let authClient: Awaited<ReturnType<typeof getGoogleClient>>;

  try {
    authClient = await getGoogleClient(userId);
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) {
      throw new HttpError(409, "Reconnect Google before using Gemini AI.");
    }

    throw error;
  }

  const quotaProjectId = getGeminiQuotaProject();

  authClient.quotaProjectId = quotaProjectId;

  return {
    models: {
      async generateContent({
        model,
        contents,
        config,
      }: GeminiGenerateContentRequest) {
        try {
          const response = await authClient.request<GeminiGenerateContentResponse>({
            url: `${geminiApiBaseUrl}/${modelResourceName(model)}:generateContent`,
            method: "POST",
            headers: {
              "x-goog-user-project": quotaProjectId,
            },
            data: {
              contents: [
                {
                  parts: [{ text: contents }],
                },
              ],
              generationConfig: config,
            },
          });
          const data = response.data;

          return {
            ...data,
            text: generatedText(data),
          };
        } catch (error) {
          throw geminiRequestError(error);
        }
      },
    },
  };
}
