import crypto from "crypto";
import bcrypt from "bcryptjs";

import { isGenerisEmail, normalizeEmail } from "@/lib/auth-domain";
import { appUrl, getEmailStatus } from "@/lib/email";
import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  sendPasswordResetEmail,
  sendSignupVerificationEmail,
} from "@/lib/services/account-emails";
import type {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  signupSchema,
} from "@/lib/validation";
import type { z } from "zod";

type SignupInput = z.infer<typeof signupSchema>;
type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;

const TOKEN_BYTES = 32;
const SIGNUP_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const PASSWORD_RESET_TOKEN_TTL_MS = 1000 * 60 * 60;

function assertEmailSent(
  delivery: Awaited<ReturnType<typeof sendSignupVerificationEmail>>,
  fallbackMessage: string,
) {
  if (delivery.status === "SENT") {
    return;
  }

  throw new HttpError(
    503,
    delivery.status === "FAILED" ? delivery.error : fallbackMessage,
  );
}

function generateAuthToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

function hashAuthToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function expiresIn(milliseconds: number) {
  return new Date(Date.now() + milliseconds);
}

function signupIdentifier(email: string) {
  return `signup:${email}`;
}

function passwordResetIdentifier(email: string) {
  return `password-reset:${email}`;
}

async function replaceVerificationToken({
  identifier,
  expires,
}: {
  identifier: string;
  expires: Date;
}) {
  const token = generateAuthToken();
  const hashedToken = hashAuthToken(token);

  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hashedToken,
      expires,
    },
  });

  return token;
}

async function findValidVerificationToken({
  identifier,
  token,
}: {
  identifier: string;
  token: string;
}) {
  const hashedToken = hashAuthToken(token);
  const verificationToken = await prisma.verificationToken.findUnique({
    where: {
      identifier_token: {
        identifier,
        token: hashedToken,
      },
    },
  });

  if (!verificationToken) {
    return null;
  }

  if (verificationToken.expires <= new Date()) {
    await prisma.verificationToken.deleteMany({
      where: { identifier, token: hashedToken },
    });
    return null;
  }

  return verificationToken;
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

async function assertDepartmentsExist(departmentIds: string[]) {
  const ids = uniqueIds(departmentIds);

  if (ids.length === 0) {
    throw new HttpError(422, "Choose at least one department.");
  }

  const count = await prisma.department.count({
    where: {
      id: { in: ids },
    },
  });

  if (count !== ids.length) {
    throw new HttpError(422, "Choose valid departments.");
  }

  return ids;
}

export async function requestSelfServiceSignup(input: SignupInput) {
  const email = normalizeEmail(input.email);

  if (!isGenerisEmail(email)) {
    throw new HttpError(422, "Use your @generisgp.com email address.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { status: true },
  });

  if (existingUser?.status === "DISABLED") {
    throw new HttpError(403, "This account cannot sign up.");
  }

  if (existingUser) {
    throw new HttpError(
      409,
      "An account already exists for this email. Sign in or reset your password.",
    );
  }

  const expires = expiresIn(SIGNUP_TOKEN_TTL_MS);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const departmentIds = await assertDepartmentsExist(input.departmentIds);

  await prisma.pendingSignup.upsert({
    where: { email },
    create: {
      email,
      name: input.name?.trim() || null,
      passwordHash,
      departmentIds,
      expiresAt: expires,
    },
    update: {
      name: input.name?.trim() || null,
      passwordHash,
      departmentIds,
      expiresAt: expires,
    },
  });

  const token = await replaceVerificationToken({
    identifier: signupIdentifier(email),
    expires,
  });
  const verificationUrl = appUrl(
    `/api/auth/signup/verify?${new URLSearchParams({ email, token })}`,
  );
  const emailDelivery = await sendSignupVerificationEmail({
    user: { email, name: input.name },
    verificationUrl,
  });
  assertEmailSent(
    emailDelivery,
    "Signup email is not configured. Please contact an administrator.",
  );

  return { ok: true };
}

export async function verifySelfServiceSignup({
  email: rawEmail,
  token,
}: {
  email: string;
  token: string;
}) {
  const email = normalizeEmail(rawEmail);

  if (!isGenerisEmail(email)) {
    throw new HttpError(422, "Use your @generisgp.com email address.");
  }

  const identifier = signupIdentifier(email);
  const verificationToken = await findValidVerificationToken({
    identifier,
    token,
  });

  if (!verificationToken) {
    throw new HttpError(400, "This verification link is invalid or expired.");
  }

  const pendingSignup = await prisma.pendingSignup.findUnique({
    where: { email },
  });

  if (!pendingSignup || pendingSignup.expiresAt <= new Date()) {
    await prisma.verificationToken.deleteMany({ where: { identifier } });
    await prisma.pendingSignup.deleteMany({ where: { email } });
    throw new HttpError(400, "This verification link is invalid or expired.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { status: true },
  });

  if (existingUser?.status === "DISABLED") {
    throw new HttpError(403, "This account cannot sign up.");
  }

  if (existingUser) {
    await prisma.verificationToken.deleteMany({ where: { identifier } });
    await prisma.pendingSignup.deleteMany({ where: { email } });
    return null;
  }

  const departmentIds = await assertDepartmentsExist(
    pendingSignup.departmentIds,
  );

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: pendingSignup.name,
        emailVerified: new Date(),
        role: "EMPLOYEE",
        roles: ["EMPLOYEE"],
        status: "ACTIVE",
        passwordHash: pendingSignup.passwordHash,
        mustChangePassword: false,
        departments: {
          create: departmentIds.map((departmentId) => ({
            departmentId,
            role: "EMPLOYEE",
          })),
        },
      },
    });

    await tx.verificationToken.deleteMany({ where: { identifier } });
    await tx.pendingSignup.deleteMany({ where: { email } });

    return user;
  });
}

export async function requestPasswordReset(input: PasswordResetRequestInput) {
  const email = normalizeEmail(input.email);

  if (!isGenerisEmail(email)) {
    throw new HttpError(422, "Use your @generisgp.com email address.");
  }

  if (!getEmailStatus().configured) {
    throw new HttpError(
      503,
      "Password reset email is not configured. Please contact an administrator.",
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { email: true, name: true, status: true },
  });

  if (!user || user.status === "DISABLED" || !user.email) {
    return {
      emailSent: false,
    };
  }

  const token = await replaceVerificationToken({
    identifier: passwordResetIdentifier(email),
    expires: expiresIn(PASSWORD_RESET_TOKEN_TTL_MS),
  });
  const resetUrl = appUrl(
    `/reset-password?${new URLSearchParams({ email, token })}`,
  );
  const emailDelivery = await sendPasswordResetEmail({
    user,
    resetUrl,
  });
  if (emailDelivery.status !== "SENT") {
    console.error(
      "Password reset email delivery failed.",
      emailDelivery.status === "FAILED"
        ? { error: emailDelivery.error }
        : { reason: emailDelivery.reason },
    );

    return { emailSent: false };
  }

  return { emailSent: true };
}

export async function resetPasswordWithToken(input: PasswordResetConfirmInput) {
  const email = normalizeEmail(input.email);

  if (!isGenerisEmail(email)) {
    throw new HttpError(422, "Use your @generisgp.com email address.");
  }

  const identifier = passwordResetIdentifier(email);
  const verificationToken = await findValidVerificationToken({
    identifier,
    token: input.token,
  });

  if (!verificationToken) {
    throw new HttpError(400, "This reset link is invalid or expired.");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      status: true,
      emailVerified: true,
    },
  });

  if (!user || user.status === "DISABLED") {
    throw new HttpError(400, "This reset link is invalid or expired.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        status: user.status === "INVITED" ? "ACTIVE" : user.status,
        emailVerified: user.emailVerified ?? new Date(),
      },
    });
    await tx.verificationToken.deleteMany({ where: { identifier } });

    return { ok: true };
  });
}
