import crypto from "crypto";
import bcrypt from "bcryptjs";

import { isGenerisEmail, normalizeEmail } from "@/lib/auth-domain";
import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { createDepartment as createDepartmentRecord, departmentMembershipSelect } from "@/lib/services/departments";
import type { accountProfileSchema, changePasswordSchema, createUserSchema, resetPasswordSchema, updateUserSchema } from "@/lib/validation";
import type { z } from "zod";

type AccountProfileInput = z.infer<typeof accountProfileSchema>;
type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
type CreateUserInput = z.infer<typeof createUserSchema>;
type UpdateUserInput = z.infer<typeof updateUserSchema>;
type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const adminUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  timezone: true,
  reviewerAllDepartments: true,
  ...departmentMembershipSelect
};

function generateTemporaryPassword() {
  return crypto.randomBytes(12).toString("base64url");
}

export async function createAppUser(input: CreateUserInput) {
  const email = normalizeEmail(input.email);

  if (!isGenerisEmail(email)) {
    throw new HttpError(422, "User email must end with @generisgp.com.");
  }

  const temporaryPassword = input.temporaryPassword ?? generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const user = await prisma.user.create({
    data: {
      email,
      name: input.name,
      role: input.role,
      status: input.status,
      passwordHash,
      mustChangePassword: true,
      reviewerAllDepartments: input.role === "REVIEWER" ? Boolean(input.reviewerAllDepartments) : false,
      departments: input.departmentIds?.length
        ? {
            create: input.departmentIds.map((departmentId) => ({
              departmentId
            }))
          }
        : undefined
    },
    select: adminUserSelect
  });

  return { user, temporaryPassword };
}

export async function updateAppUser(userId: string, input: UpdateUserInput) {
  const { departmentIds, reviewerAllDepartments, role, ...userInput } = input;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        ...userInput,
        role,
        reviewerAllDepartments: role && role !== "REVIEWER" ? false : reviewerAllDepartments
      }
    });

    if (departmentIds) {
      await tx.userDepartment.deleteMany({
        where: { userId }
      });

      if (departmentIds.length > 0) {
        await tx.userDepartment.createMany({
          data: departmentIds.map((departmentId) => ({
            userId,
            departmentId
          })),
          skipDuplicates: true
        });
      }
    }

    return tx.user.findUniqueOrThrow({
      where: { id: user.id },
      select: adminUserSelect
    });
  });
}

export async function createDepartment(name: string) {
  return createDepartmentRecord(name);
}

export async function changeOwnPassword(userId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user?.passwordHash) {
    throw new HttpError(400, "This account does not have a credentials password.");
  }

  const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash);

  if (!isValid) {
    throw new HttpError(400, "Current password was not accepted.");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);

  return prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: false,
      status: user.status === "INVITED" ? "ACTIVE" : user.status
    }
  });
}

export async function updateOwnProfile(userId: string, input: AccountProfileInput) {
  const name = input.name?.trim() || null;

  return prisma.user.update({
    where: { id: userId },
    data: {
      name,
      timezone: input.timezone
    }
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
    },
    select: adminUserSelect
  });

  return { user, temporaryPassword };
}
