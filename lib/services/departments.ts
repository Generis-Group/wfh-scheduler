import type { Prisma, UserRole } from "@prisma/client";
import { revalidateTag, unstable_cache } from "next/cache";

import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { hasUserRole } from "@/lib/roles";

export type ReviewScope = {
  userId: string;
  role?: UserRole;
  roles?: UserRole[];
};

export const departmentMembershipInclude = {
  departments: {
    include: {
      department: true,
    },
    orderBy: {
      department: {
        name: "asc" as const,
      },
    },
  },
};

export const departmentMembershipSelect = {
  departments: {
    select: {
      departmentId: true,
      role: true,
      department: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy: {
      department: {
        name: "asc" as const,
      },
    },
  },
};

function slugifyDepartmentName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function departmentNames(
  user?: {
    departments?: Array<{
      role?: UserRole | null;
      department?: { name: string } | null;
    }>;
  } | null,
  role?: UserRole,
) {
  return (
    user?.departments
      ?.filter((membership) => !role || membership.role === role)
      .map((membership) => membership.department?.name)
      .filter((name): name is string => Boolean(name)) ?? []
  );
}

export function departmentLabel(
  user?: {
    departments?: Array<{
      role?: UserRole | null;
      department?: { name: string } | null;
    }>;
  } | null,
  fallback = "No department",
  role?: UserRole,
) {
  const names = departmentNames(user, role);

  if (names.length === 0) {
    return fallback;
  }

  return names.join(", ");
}

export const departmentsCacheTag = "departments";

async function readDepartments() {
  return prisma.department.findMany({
    orderBy: { name: "asc" },
  });
}

const getCachedDepartments = unstable_cache(
  readDepartments,
  ["departments:list"],
  {
    revalidate: 300,
    tags: [departmentsCacheTag],
  },
);

export async function listDepartments() {
  try {
    return await getCachedDepartments();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("incrementalCache missing")
    ) {
      return readDepartments();
    }

    throw error;
  }
}

export async function createDepartment(name: string) {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new HttpError(422, "Department name is required.");
  }

  const slug = slugifyDepartmentName(trimmedName);

  if (!slug) {
    throw new HttpError(
      422,
      "Department name must include letters or numbers.",
    );
  }

  const department = await prisma.department.create({
    data: {
      name: trimmedName,
      slug,
    },
  });

  revalidateTag(departmentsCacheTag);

  return department;
}

export async function deleteDepartment(departmentId: string) {
  const trimmedId = departmentId.trim();

  if (!trimmedId) {
    throw new HttpError(422, "Department id is required.");
  }

  const deleted = await prisma.department.deleteMany({
    where: { id: trimmedId },
  });

  if (deleted.count === 0) {
    throw new HttpError(404, "Department not found.");
  }

  revalidateTag(departmentsCacheTag);

  return { ok: true };
}

export async function getReviewableEmployeeWhere(
  scope?: ReviewScope,
): Promise<Prisma.UserWhereInput> {
  const base: Prisma.UserWhereInput = {
    roles: { has: "EMPLOYEE" },
    status: { not: "DISABLED" },
  };

  if (!scope) {
    return base;
  }

  if (hasUserRole(scope, "ADMIN")) {
    return base;
  }

  if (!hasUserRole(scope, "REVIEWER")) {
    return {
      ...base,
      id: scope.userId,
    };
  }

  const reviewer = await prisma.user.findUnique({
    where: { id: scope.userId },
    select: {
      reviewerAllDepartments: true,
      departments: {
        where: { role: "REVIEWER" },
        select: {
          departmentId: true,
        },
      },
    },
  });

  if (reviewer?.reviewerAllDepartments) {
    return base;
  }

  const departmentIds =
    reviewer?.departments.map((department) => department.departmentId) ?? [];

  if (departmentIds.length === 0) {
    return {
      ...base,
      id: { in: [] },
    };
  }

  return {
    ...base,
    departments: {
      some: {
        role: "EMPLOYEE",
        departmentId: { in: departmentIds },
      },
    },
  };
}

export async function canReviewEmployee(
  scope: ReviewScope,
  employeeId: string,
) {
  if (!hasUserRole(scope, "REVIEWER")) {
    return false;
  }

  const employeeWhere = await getReviewableEmployeeWhere(scope);
  const count = await prisma.user.count({
    where: {
      ...employeeWhere,
      id: employeeId,
    },
  });

  return count > 0;
}
