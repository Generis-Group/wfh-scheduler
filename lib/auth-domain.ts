export const REQUIRED_EMAIL_DOMAIN = "generisgp.com";

export function normalizeEmail(email?: string | null) {
  return email?.toLowerCase().trim() ?? "";
}

export function isGenerisEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  return normalized.endsWith(`@${REQUIRED_EMAIL_DOMAIN}`);
}

export function generisEmailMessage() {
  return `Use your @${REQUIRED_EMAIL_DOMAIN} email address.`;
}
