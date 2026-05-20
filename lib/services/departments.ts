import type { Prisma, UserRole } from "@prisma/client";

import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export type ReviewScope = {
  userId: string;
  role: UserRole;
};

export const departmentMembershipInclude = {
  departments: {
    include: {
      department: true
    },
    orderBy: {
      department: {
        name: "asc" as const
      }
    }
  }
};

export const departmentMembershipSelect = {
  departments: {
    select: {
      departmentId: true,
      department: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    },
    orderBy: {
      department: {
        name: "asc" as const
      }
    }
  }
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
    departments?: Array<{ department?: { name: string } | null }>;
  } | null
) {
  return user?.departments?.map((membership) => membership.department?.name).filter((name): name is string => Boolean(name)) ?? [];
}

export function departmentLabel(
  user?: {
    departments?: Array<{ department?: { name: string } | null }>;
  } | null,
  fallback = "No department"
) {
  const names = departmentNames(user);

  if (names.length === 0) {
    return fallback;
  }

  return names.join(", ");
}

export async function listDepartments() {
  return prisma.department.findMany({
    orderBy: { name: "asc" }
  });
}

export async function createDepartment(name: string) {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new HttpError(422, "Department name is required.");
  }

  const slug = slugifyDepartmentName(trimmedName);

  if (!slug) {
    throw new HttpError(422, "Department name must include letters or numbers.");
  }

  return prisma.department.create({
    data: {
      name: trimmedName,
      slug
    }
  });
}

export async function getReviewableEmployeeWhere(scope?: ReviewScope): Promise<Prisma.UserWhereInput> {
  const base: Prisma.UserWhereInput = {
    role: "EMPLOYEE",
    status: { not: "DISABLED" }
  };

  if (!scope || scope.role === "ADMIN") {
    return base;
  }

  if (scope.role !== "REVIEWER") {
    return {
      ...base,
      id: scope.userId
    };
  }

  const reviewer = await prisma.user.findUnique({
    where: { id: scope.userId },
    select: {
      reviewerAllDepartments: true,
      departments: {
        select: {
          departmentId: true
        }
      }
    }
  });

  if (reviewer?.reviewerAllDepartments) {
    return base;
  }

  const departmentIds = reviewer?.departments.map((department) => department.departmentId) ?? [];

  if (departmentIds.length === 0) {
    return {
      ...base,
      id: { in: [] }
    };
  }

  return {
    ...base,
    departments: {
      some: {
        departmentId: { in: departmentIds }
      }
    }
  };
}

export async function canReviewEmployee(scope: ReviewScope, employeeId: string) {
  if (scope.role === "ADMIN") {
    return true;
  }

  if (scope.role !== "REVIEWER") {
    return scope.userId === employeeId;
  }

  const employeeWhere = await getReviewableEmployeeWhere(scope);
  const count = await prisma.user.count({
    where: {
      ...employeeWhere,
      id: employeeId
    }
  });

  return count > 0;
}
