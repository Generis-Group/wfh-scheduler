import crypto from "crypto";
import bcrypt from "bcryptjs";

import { isGenerisEmail, normalizeEmail } from "@/lib/auth-domain";
import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { hasUserRole, normalizeUserRoles, primaryUserRole } from "@/lib/roles";
import type { EmailDelivery } from "@/lib/email";
import { sendTemporaryPasswordEmail } from "@/lib/services/account-emails";
import {
  createDepartment as createDepartmentRecord,
  departmentMembershipSelect,
} from "@/lib/services/departments";
import type {
  accountProfileSchema,
  changePasswordSchema,
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "@/lib/validation";
import type { z } from "zod";

type AccountProfileInput = z.infer<typeof accountProfileSchema>;
type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
type CreateUserInput = z.infer<typeof createUserSchema>;
type UpdateUserInput = z.infer<typeof updateUserSchema>;
type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
type UpdateAppUserOptions = {
  actorUserId?: string | null;
};

export const adminUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  roles: true,
  status: true,
  reviewerAllDepartments: true,
  ...departmentMembershipSelect,
};

function generateTemporaryPassword() {
  return crypto.randomBytes(12).toString("base64url");
}

function uniqueIds(ids?: string[]) {
  return [...new Set(ids ?? [])];
}

function membershipIds(
  memberships: Array<{ departmentId: string; role?: string | null }>,
  role: "EMPLOYEE" | "REVIEWER",
) {
  return memberships
    .filter((membership) => (membership.role ?? "EMPLOYEE") === role)
    .map((membership) => membership.departmentId);
}

function resolveLegacyDepartmentIds(input: {
  roles?: CreateUserInput["roles"] | UpdateUserInput["roles"];
  role?: CreateUserInput["role"] | UpdateUserInput["role"];
  departmentIds?: string[];
  employeeDepartmentIds?: string[];
  reviewerDepartmentIds?: string[];
}) {
  const roles = normalizeUserRoles({
    role: input.role ?? "EMPLOYEE",
    roles: input.roles,
  });
  const hasEmployee = roles.includes("EMPLOYEE");
  const hasReviewer = roles.includes("REVIEWER");

  if (
    input.employeeDepartmentIds !== undefined ||
    input.reviewerDepartmentIds !== undefined
  ) {
    return {
      employeeDepartmentIds: input.employeeDepartmentIds,
      reviewerDepartmentIds: input.reviewerDepartmentIds,
    };
  }

  if (!input.departmentIds) {
    return {
      employeeDepartmentIds: undefined,
      reviewerDepartmentIds: undefined,
    };
  }

  return {
    employeeDepartmentIds: hasEmployee ? input.departmentIds : undefined,
    reviewerDepartmentIds:
      hasReviewer && !hasEmployee ? input.departmentIds : undefined,
  };
}

async function deliverTemporaryPasswordEmail({
  user,
  temporaryPassword,
  kind,
}: {
  user: {
    email?: string | null;
    name?: string | null;
  };
  temporaryPassword: string;
  kind: "INVITE" | "RESET";
}): Promise<EmailDelivery> {
  return sendTemporaryPasswordEmail({
    user,
    temporaryPassword,
    kind,
  });
}

export async function createAppUser(input: CreateUserInput) {
  const email = normalizeEmail(input.email);

  if (!isGenerisEmail(email)) {
    throw new HttpError(422, "User email must end with @generisgp.com.");
  }

  const temporaryPassword =
    input.temporaryPassword ?? generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const roles = normalizeUserRoles({
    role: input.role ?? "EMPLOYEE",
    roles: input.roles,
  });
  const role = primaryUserRole({ roles });
  const { employeeDepartmentIds, reviewerDepartmentIds } =
    resolveLegacyDepartmentIds(input);
  const employeeIds = roles.includes("EMPLOYEE")
    ? uniqueIds(employeeDepartmentIds)
    : [];
  const reviewerIds = roles.includes("REVIEWER")
    ? uniqueIds(reviewerDepartmentIds)
    : [];

  const user = await prisma.user.create({
    data: {
      email,
      name: input.name,
      role,
      roles,
      status: input.status,
      passwordHash,
      mustChangePassword: true,
      reviewerAllDepartments: roles.includes("REVIEWER")
        ? Boolean(input.reviewerAllDepartments)
        : false,
      departments:
        employeeIds.length || reviewerIds.length
          ? {
              create: [
                ...employeeIds.map((departmentId) => ({
                  departmentId,
                  role: "EMPLOYEE" as const,
                })),
                ...reviewerIds.map((departmentId) => ({
                  departmentId,
                  role: "REVIEWER" as const,
                })),
              ],
            }
          : undefined,
    },
    select: adminUserSelect,
  });

  const emailDelivery = await deliverTemporaryPasswordEmail({
    user,
    temporaryPassword,
    kind: "INVITE",
  });

  return { user, temporaryPassword, emailDelivery };
}

export async function updateAppUser(
  userId: string,
  input: UpdateUserInput,
  options: UpdateAppUserOptions = {},
) {
  const {
    departmentIds,
    employeeDepartmentIds,
    reviewerDepartmentIds,
    reviewerAllDepartments,
    role,
    roles,
    ...userInput
  } = input;

  return prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        role: true,
        roles: true,
        reviewerAllDepartments: true,
        departments: {
          select: {
            departmentId: true,
            role: true,
          },
        },
      },
    });
    const rolesChanged = roles !== undefined || role !== undefined;
    const nextRoles = rolesChanged
      ? normalizeUserRoles({ role, roles })
      : normalizeUserRoles(existingUser);
    const canBeReviewer = nextRoles.includes("REVIEWER");
    const legacyDepartmentIds = resolveLegacyDepartmentIds({
      roles: nextRoles,
      role: primaryUserRole({ roles: nextRoles }),
      departmentIds,
      employeeDepartmentIds,
      reviewerDepartmentIds,
    });
    const nextReviewerAllDepartments = canBeReviewer
      ? (reviewerAllDepartments ?? existingUser.reviewerAllDepartments)
      : false;
    const assignmentsChanged =
      rolesChanged ||
      departmentIds !== undefined ||
      employeeDepartmentIds !== undefined ||
      reviewerDepartmentIds !== undefined ||
      reviewerAllDepartments !== undefined;
    const nextEmployeeDepartmentIds = hasUserRole(
      { roles: nextRoles },
      "EMPLOYEE",
    )
      ? uniqueIds(
          legacyDepartmentIds.employeeDepartmentIds ??
            membershipIds(existingUser.departments, "EMPLOYEE"),
        )
      : [];
    const nextReviewerDepartmentIds = canBeReviewer
      ? uniqueIds(
          legacyDepartmentIds.reviewerDepartmentIds ??
            membershipIds(existingUser.departments, "REVIEWER"),
        )
      : [];

    if (options.actorUserId === userId && !nextRoles.includes("ADMIN")) {
      throw new HttpError(400, "You cannot remove your own admin access.");
    }

    if (options.actorUserId === userId && userInput.status === "DISABLED") {
      throw new HttpError(400, "You cannot remove your own account.");
    }

    if (
      assignmentsChanged &&
      nextRoles.includes("EMPLOYEE") &&
      nextEmployeeDepartmentIds.length === 0
    ) {
      throw new HttpError(422, "Employees need at least one department.");
    }

    if (
      assignmentsChanged &&
      canBeReviewer &&
      !nextReviewerAllDepartments &&
      nextReviewerDepartmentIds.length === 0
    ) {
      throw new HttpError(
        422,
        "Reviewers need a reviewer scope. Select departments or all departments.",
      );
    }

    const user = await tx.user.update({
      where: { id: userId },
      data: {
        ...userInput,
        role: primaryUserRole({ roles: nextRoles }),
        roles: nextRoles,
        reviewerAllDepartments: nextReviewerAllDepartments,
      },
    });

    if (
      legacyDepartmentIds.employeeDepartmentIds !== undefined ||
      !hasUserRole({ roles: nextRoles }, "EMPLOYEE")
    ) {
      await tx.userDepartment.deleteMany({
        where: { userId, role: "EMPLOYEE" },
      });

      if (nextEmployeeDepartmentIds.length > 0) {
        await tx.userDepartment.createMany({
          data: nextEmployeeDepartmentIds.map((departmentId) => ({
            userId,
            departmentId,
            role: "EMPLOYEE",
          })),
          skipDuplicates: true,
        });
      }
    }

    if (
      legacyDepartmentIds.reviewerDepartmentIds !== undefined ||
      !canBeReviewer
    ) {
      await tx.userDepartment.deleteMany({
        where: { userId, role: "REVIEWER" },
      });

      if (nextReviewerDepartmentIds.length > 0) {
        await tx.userDepartment.createMany({
          data: nextReviewerDepartmentIds.map((departmentId) => ({
            userId,
            departmentId,
            role: "REVIEWER",
          })),
          skipDuplicates: true,
        });
      }
    }

    return tx.user.findUniqueOrThrow({
      where: { id: user.id },
      select: adminUserSelect,
    });
  });
}

export async function createDepartment(name: string) {
  return createDepartmentRecord(name);
}

export async function changeOwnPassword(
  userId: string,
  input: ChangePasswordInput,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user?.passwordHash) {
    throw new HttpError(
      400,
      "This account does not have a credentials password.",
    );
  }

  const isValid = await bcrypt.compare(
    input.currentPassword,
    user.passwordHash,
  );

  if (!isValid) {
    throw new HttpError(400, "Current password was not accepted.");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);

  return prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: false,
      status: user.status === "INVITED" ? "ACTIVE" : user.status,
    },
  });
}

export async function updateOwnProfile(
  userId: string,
  input: AccountProfileInput,
) {
  const name = input.name?.trim() || null;
  const email = normalizeEmail(input.email);

  if (!isGenerisEmail(email)) {
    throw new HttpError(422, "User email must end with @generisgp.com.");
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      email,
      id: { not: userId },
    },
    select: { id: true },
  });

  if (existingUser) {
    throw new HttpError(409, "That email is already in use.");
  }

  const data: {
    name: string | null;
    email: string;
    image?: string | null;
  } = {
    name,
    email,
  };

  if ("image" in input) {
    data.image = input.image ?? null;
  }

  return prisma.user.update({
    where: { id: userId },
    data,
  });
}

export async function resetAppUserPassword(
  userId: string,
  input: ResetPasswordInput,
) {
  const temporaryPassword =
    input.temporaryPassword ?? generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: true,
      status: "ACTIVE",
    },
    select: adminUserSelect,
  });

  const emailDelivery = await deliverTemporaryPasswordEmail({
    user,
    temporaryPassword,
    kind: "RESET",
  });

  return { user, temporaryPassword, emailDelivery };
}

export async function deleteAppUserReportData(userId: string) {
  return prisma.$transaction(async (tx) => {
    const reports = await tx.dailyReport.findMany({
      where: { userId },
      select: { id: true },
    });
    const reportIds = reports.map((report) => report.id);
    const bugReports = await tx.bugReport.findMany({
      where: { reporterId: userId },
      select: { id: true },
    });
    const bugReportIds = bugReports.map((report) => report.id);

    const reportReadReceipts = await tx.reportReadReceipt.deleteMany({
      where: {
        OR: [
          { reviewerId: userId },
          ...(reportIds.length ? [{ reportId: { in: reportIds } }] : []),
        ],
      },
    });
    const reportComments = await tx.reportComment.deleteMany({
      where: {
        OR: [
          { authorId: userId },
          ...(reportIds.length ? [{ reportId: { in: reportIds } }] : []),
        ],
      },
    });
    const reportRevisions = await tx.reportRevision.deleteMany({
      where: {
        OR: [
          { editedById: userId },
          ...(reportIds.length ? [{ reportId: { in: reportIds } }] : []),
        ],
      },
    });
    const activityItems = await tx.activityItem.deleteMany({
      where: {
        OR: [
          { userId },
          ...(reportIds.length ? [{ dailyReportId: { in: reportIds } }] : []),
        ],
      },
    });
    const dailyReports = await tx.dailyReport.deleteMany({
      where: { userId },
    });
    const weeklyReports = await tx.weeklyReport.deleteMany({
      where: { employeeId: userId },
    });
    const generatedWeeklyReports = await tx.weeklyReport.updateMany({
      where: { generatedById: userId },
      data: { generatedById: null },
    });
    const syncRuns = await tx.syncRun.deleteMany({
      where: { userId },
    });
    const integrationSettings = await tx.userIntegrationSettings.deleteMany({
      where: { userId },
    });
    const bugReportAttachments = bugReportIds.length
      ? await tx.bugReportAttachment.deleteMany({
          where: { bugReportId: { in: bugReportIds } },
        })
      : { count: 0 };
    const bugReportsDeleted = await tx.bugReport.deleteMany({
      where: { reporterId: userId },
    });

    await tx.bugReport.updateMany({
      where: { solvedById: userId },
      data: { solvedById: null },
    });

    return {
      activityItems: activityItems.count,
      bugReportAttachments: bugReportAttachments.count,
      bugReports: bugReportsDeleted.count,
      dailyReports: dailyReports.count,
      integrationSettings: integrationSettings.count,
      reportComments: reportComments.count,
      reportReadReceipts: reportReadReceipts.count,
      reportRevisions: reportRevisions.count,
      generatedWeeklyReports: generatedWeeklyReports.count,
      syncRuns: syncRuns.count,
      weeklyReports: weeklyReports.count,
    };
  });
}
