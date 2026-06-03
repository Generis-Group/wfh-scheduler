import type { DailyReport, UserRole } from "@prisma/client";

import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { hasUserRole, normalizeUserRoles } from "@/lib/roles";
import { canReviewEmployee } from "@/lib/services/departments";

export type AppSession = Awaited<ReturnType<typeof auth>>;

export async function requireSession(
  options: { allowPasswordChangeRequired?: boolean } = {},
) {
  const session = await auth();

  if (!session?.user?.id || session.user.status === "DISABLED") {
    throw new HttpError(401, "Authentication required.");
  }

  if (session.user.mustChangePassword && !options.allowPasswordChangeRequired) {
    throw new HttpError(
      403,
      "Change your temporary password before continuing.",
    );
  }

  return session;
}

export async function requireRole(roles: UserRole[]) {
  const session = await requireSession();

  if (!roles.some((role) => hasUserRole(session.user, role))) {
    throw new HttpError(403, "You do not have access to this resource.");
  }

  return session;
}

export function canAccessUser(
  session: NonNullable<AppSession>,
  userId: string,
) {
  return session.user.id === userId || hasUserRole(session.user, "ADMIN");
}

export function assertCanAccessUser(
  session: NonNullable<AppSession>,
  userId: string,
) {
  if (!canAccessUser(session, userId)) {
    throw new HttpError(403, "You do not have access to this user's data.");
  }
}

export async function assertCanAccessUserData(
  session: NonNullable<AppSession>,
  userId: string,
) {
  if (canAccessUser(session, userId)) {
    return;
  }

  if (
    hasUserRole(session.user, "REVIEWER") &&
    (await canReviewEmployee(
      { userId: session.user.id, roles: normalizeUserRoles(session.user) },
      userId,
    ))
  ) {
    return;
  }

  throw new HttpError(403, "You do not have access to this user's data.");
}

export async function assertCanAccessReport(
  session: NonNullable<AppSession>,
  report: Pick<DailyReport, "userId">,
) {
  await assertCanAccessUserData(session, report.userId);
}

export async function assertCanReviewUserData(
  session: NonNullable<AppSession>,
  userId: string,
) {
  if (
    hasUserRole(session.user, "REVIEWER") &&
    (await canReviewEmployee(
      { userId: session.user.id, roles: normalizeUserRoles(session.user) },
      userId,
    ))
  ) {
    return;
  }

  throw new HttpError(
    403,
    "You do not have review access to this user's data.",
  );
}

export async function assertCanReviewReport(
  session: NonNullable<AppSession>,
  report: Pick<DailyReport, "userId">,
) {
  await assertCanReviewUserData(session, report.userId);
}

export function canMutateReport(
  session: NonNullable<AppSession>,
  report: Pick<DailyReport, "userId">,
) {
  return (
    hasUserRole(session.user, "EMPLOYEE") && session.user.id === report.userId
  );
}

export function assertCanMutateReport(
  session: NonNullable<AppSession>,
  report: Pick<DailyReport, "userId">,
) {
  if (!canMutateReport(session, report)) {
    throw new HttpError(
      403,
      "Only the report owner can edit or submit this report.",
    );
  }
}

export function assertCanAdminManageReport(session: NonNullable<AppSession>) {
  if (!hasUserRole(session.user, "ADMIN")) {
    throw new HttpError(403, "Only admins can manage submitted reports.");
  }
}
