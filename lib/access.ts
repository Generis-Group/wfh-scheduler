import type { DailyReport, UserRole } from "@prisma/client";

import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/http";

export type AppSession = Awaited<ReturnType<typeof auth>>;

export async function requireSession(options: { allowPasswordChangeRequired?: boolean } = {}) {
  const session = await auth();

  if (!session?.user?.id || session.user.status === "DISABLED") {
    throw new HttpError(401, "Authentication required.");
  }

  if (session.user.mustChangePassword && !options.allowPasswordChangeRequired) {
    throw new HttpError(403, "Change your temporary password before continuing.");
  }

  return session;
}

export async function requireRole(roles: UserRole[]) {
  const session = await requireSession();

  if (!roles.includes(session.user.role)) {
    throw new HttpError(403, "You do not have access to this resource.");
  }

  return session;
}

export function canAccessUser(session: NonNullable<AppSession>, userId: string) {
  return session.user.id === userId || session.user.role === "REVIEWER" || session.user.role === "ADMIN";
}

export function assertCanAccessUser(session: NonNullable<AppSession>, userId: string) {
  if (!canAccessUser(session, userId)) {
    throw new HttpError(403, "You do not have access to this user's data.");
  }
}

export function assertCanAccessReport(session: NonNullable<AppSession>, report: Pick<DailyReport, "userId">) {
  assertCanAccessUser(session, report.userId);
}
