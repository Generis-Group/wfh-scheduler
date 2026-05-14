import { notFound } from "next/navigation";

export function isPreviewBypassEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_PREVIEW_BYPASS === "true";
}

export function requirePreviewBypass() {
  if (!isPreviewBypassEnabled()) {
    notFound();
  }
}
