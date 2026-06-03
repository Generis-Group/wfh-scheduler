import "server-only";

import { GoogleGenAI } from "@google/genai";

import { getRequiredEnv } from "@/lib/env";

const defaultGeminiModel = "gemini-2.5-flash";

let geminiClient: GoogleGenAI | null = null;

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || defaultGeminiModel;
}

export function getGeminiClient() {
  geminiClient ??= new GoogleGenAI({
    apiKey: getRequiredEnv("GEMINI_API_KEY"),
  });

  return geminiClient;
}
