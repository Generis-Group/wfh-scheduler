import type { UserRole } from "@prisma/client";

export const appRoles: UserRole[] = ["EMPLOYEE", "REVIEWER", "ADMIN"];

export type RoleBearingUser = {
  role?: UserRole | null;
  roles?: readonly UserRole[] | null;
};

export function normalizeUserRoles(user?: RoleBearingUser | null): UserRole[] {
  const source = user?.roles?.length ? user.roles : user?.role ? [user.role] : ["EMPLOYEE"];
  const normalized = appRoles.filter((role) => source.includes(role));

  return normalized.length ? normalized : ["EMPLOYEE"];
}

export function hasUserRole(user: RoleBearingUser | null | undefined, role: UserRole) {
  return normalizeUserRoles(user).includes(role);
}

export function primaryUserRole(user?: RoleBearingUser | null): UserRole {
  const roles = normalizeUserRoles(user);

  if (roles.includes("ADMIN")) {
    return "ADMIN";
  }

  if (roles.includes("REVIEWER")) {
    return "REVIEWER";
  }

  return "EMPLOYEE";
}

export function roleListLabel(user?: RoleBearingUser | null) {
  const labels: Record<UserRole, string> = {
    EMPLOYEE: "Employee",
    REVIEWER: "Reviewer",
    ADMIN: "Admin",
  };

  return normalizeUserRoles(user).map((role) => labels[role]).join(", ");
}
