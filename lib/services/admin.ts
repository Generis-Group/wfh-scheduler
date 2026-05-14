import crypto from "crypto";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import type { createUserSchema, resetPasswordSchema, updateUserSchema } from "@/lib/validation";
import type { z } from "zod";

type CreateUserInput = z.infer<typeof createUserSchema>;
type UpdateUserInput = z.infer<typeof updateUserSchema>;
type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

function generateTemporaryPassword() {
  return crypto.randomBytes(12).toString("base64url");
}

export async function createAppUser(input: CreateUserInput) {
  const temporaryPassword = input.temporaryPassword ?? generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      name: input.name,
      role: input.role,
      status: input.status,
      passwordHash,
      mustChangePassword: true
    }
  });

  return { user, temporaryPassword };
}

export async function updateAppUser(userId: string, input: UpdateUserInput) {
  return prisma.user.update({
    where: { id: userId },
    data: input
  });
}

export async function resetAppUserPassword(userId: string, input: ResetPasswordInput) {
  const temporaryPassword = input.temporaryPassword ?? generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: true,
      status: "ACTIVE"
    }
  });

  return { user, temporaryPassword };
}
