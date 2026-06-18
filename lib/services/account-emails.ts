import {
  appUrl,
  escapeAttribute,
  escapeHtml,
  trySendEmail,
} from "@/lib/email";

type AccountEmailUser = {
  email?: string | null;
  name?: string | null;
};

type TemporaryPasswordEmailKind = "INVITE" | "RESET";

export async function sendTemporaryPasswordEmail({
  user,
  temporaryPassword,
  kind,
}: {
  user: AccountEmailUser;
  temporaryPassword: string;
  kind: TemporaryPasswordEmailKind;
}) {
  if (!user.email) {
    return {
      status: "SKIPPED" as const,
      reason: "User does not have an email address.",
    };
  }

  const email = user.email;
  const name = user.name?.trim() || email;
  const signInUrl = appUrl("/login");
  const subject =
    kind === "INVITE"
      ? "Your Generis Reports account"
      : "Your Generis Reports temporary password";
  const intro =
    kind === "INVITE"
      ? "An account has been created for you in Generis Reports."
      : "Your Generis Reports password was reset.";
  const text = [
    `Hi ${name},`,
    "",
    intro,
    "",
    `Sign in: ${signInUrl}`,
    `Email: ${email}`,
    `Temporary password: ${temporaryPassword}`,
    "",
    "You will be asked to choose a new password after signing in.",
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <h1 style="font-size: 20px; margin: 0 0 12px;">Generis Reports</h1>
      <p style="margin: 0 0 14px;">Hi ${escapeHtml(name)},</p>
      <p style="margin: 0 0 18px;">${escapeHtml(intro)}</p>
      <div style="margin: 0 0 18px; padding: 14px; border: 1px solid #d8dee8; border-radius: 8px; background: #f8fafc;">
        <p style="margin: 0 0 8px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p style="margin: 0;"><strong>Temporary password:</strong> <code style="font-family: ui-monospace, SFMono-Regular, Consolas, monospace;">${escapeHtml(temporaryPassword)}</code></p>
      </div>
      <p style="margin: 0 0 20px;">You will be asked to choose a new password after signing in.</p>
      <p style="margin: 0;">
        <a href="${escapeAttribute(signInUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 14px; border-radius: 6px; text-decoration: none; font-weight: 600;">Sign in to Generis Reports</a>
      </p>
    </div>
  `;

  return trySendEmail({
    to: email,
    subject,
    html,
    text,
  });
}

export async function sendSignupVerificationEmail({
  user,
  verificationUrl,
}: {
  user: AccountEmailUser;
  verificationUrl: string;
}) {
  if (!user.email) {
    return {
      status: "SKIPPED" as const,
      reason: "User does not have an email address.",
    };
  }

  const email = user.email;
  const name = user.name?.trim() || email;
  const text = [
    `Hi ${name},`,
    "",
    "Verify your Generis Reports account to finish signing up.",
    "",
    verificationUrl,
    "",
    "If you did not request this account, you can ignore this email.",
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <h1 style="font-size: 20px; margin: 0 0 12px;">Generis Reports</h1>
      <p style="margin: 0 0 14px;">Hi ${escapeHtml(name)},</p>
      <p style="margin: 0 0 18px;">Verify your Generis Reports account to finish signing up.</p>
      <p style="margin: 0 0 20px;">
        <a href="${escapeAttribute(verificationUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 14px; border-radius: 6px; text-decoration: none; font-weight: 600;">Verify account</a>
      </p>
      <p style="margin: 0; color: #64748b; font-size: 13px;">If you did not request this account, you can ignore this email.</p>
    </div>
  `;

  return trySendEmail({
    to: email,
    subject: "Verify your Generis Reports account",
    html,
    text,
  });
}

export async function sendPasswordResetEmail({
  user,
  resetUrl,
}: {
  user: AccountEmailUser;
  resetUrl: string;
}) {
  if (!user.email) {
    return {
      status: "SKIPPED" as const,
      reason: "User does not have an email address.",
    };
  }

  const email = user.email;
  const name = user.name?.trim() || email;
  const text = [
    `Hi ${name},`,
    "",
    "Reset your Generis Reports password using this link:",
    "",
    resetUrl,
    "",
    "If you did not request this reset, you can ignore this email.",
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <h1 style="font-size: 20px; margin: 0 0 12px;">Generis Reports</h1>
      <p style="margin: 0 0 14px;">Hi ${escapeHtml(name)},</p>
      <p style="margin: 0 0 18px;">Reset your Generis Reports password using this link.</p>
      <p style="margin: 0 0 20px;">
        <a href="${escapeAttribute(resetUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 14px; border-radius: 6px; text-decoration: none; font-weight: 600;">Reset password</a>
      </p>
      <p style="margin: 0; color: #64748b; font-size: 13px;">If you did not request this reset, you can ignore this email.</p>
    </div>
  `;

  return trySendEmail({
    to: email,
    subject: "Reset your Generis Reports password",
    html,
    text,
  });
}
