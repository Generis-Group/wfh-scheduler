import type { z } from "zod";

import { HttpError } from "@/lib/http";
import {
  defaultPaginationPageSize,
  normalizedPage,
  normalizedPageSize,
} from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { hasUserRole, type RoleBearingUser } from "@/lib/roles";
import type {
  createBugReportSchema,
  updateBugReportStatusSchema,
} from "@/lib/validation";

type CreateBugReportInput = z.infer<typeof createBugReportSchema>;
type UpdateBugReportStatusInput = z.infer<typeof updateBugReportStatusSchema>;
type BugReportListOptions = {
  userId: string;
  canReviewAll: boolean;
  status?: "OPEN" | "SOLVED";
  search?: string | null;
  page?: number | null;
  limit?: number;
};

const defaultBugReportPageSize = defaultPaginationPageSize;

const bugReportReporterSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
};

export const bugReportListInclude = {
  reporter: {
    select: bugReportReporterSelect,
  },
  solvedBy: {
    select: bugReportReporterSelect,
  },
  attachments: {
    select: {
      id: true,
      fileName: true,
      contentType: true,
      sizeBytes: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
};

export const bugReportDetailInclude = {
  reporter: {
    select: bugReportReporterSelect,
  },
  solvedBy: {
    select: bugReportReporterSelect,
  },
  attachments: {
    select: {
      id: true,
      fileName: true,
      contentType: true,
      dataUrl: true,
      sizeBytes: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
};

export function canReviewBugReports(user?: RoleBearingUser | null) {
  return hasUserRole(user, "ADMIN");
}

function pageSize(value: number | undefined, fallback = defaultBugReportPageSize) {
  return normalizedPageSize(value, fallback);
}

function bugReportListWhere({
  userId,
  canReviewAll,
  status,
  search,
}: Pick<
  BugReportListOptions,
  "userId" | "canReviewAll" | "status" | "search"
>) {
  const where = {
    ...(canReviewAll ? {} : { reporterId: userId }),
    ...(status ? { status } : {}),
  };
  const query = search?.trim();

  if (!query) {
    return where;
  }

  const textFilter = { contains: query, mode: "insensitive" as const };

  return {
    ...where,
    OR: [
      { body: textFilter },
      { pagePath: textFilter },
      { reporter: { is: { name: textFilter } } },
      { reporter: { is: { email: textFilter } } },
    ],
  };
}

export async function createBugReport(
  reporterId: string,
  input: CreateBugReportInput,
) {
  return prisma.bugReport.create({
    data: {
      reporterId,
      body: input.body,
      pagePath: input.pagePath || null,
      userAgent: input.userAgent || null,
      attachments:
        input.attachments.length > 0
          ? {
              create: input.attachments.map((attachment) => ({
                fileName: attachment.fileName,
                contentType: attachment.contentType,
                dataUrl: attachment.dataUrl,
                sizeBytes: attachment.sizeBytes,
              })),
            }
          : undefined,
    },
    include: bugReportDetailInclude,
  });
}

export async function listVisibleBugReports(options: BugReportListOptions) {
  const limit = pageSize(options.limit);
  const currentPage = normalizedPage(options.page);
  const where = bugReportListWhere(options);
  const [totalCount, records] = await prisma.$transaction([
    prisma.bugReport.count({ where }),
    prisma.bugReport.findMany({
      where,
      include: bugReportListInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (currentPage - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    reports: records,
    page: currentPage,
    pageSize: limit,
    totalCount,
  };
}

export async function getVisibleBugReport(
  reportId: string,
  {
    userId,
    canReviewAll,
  }: {
    userId: string;
    canReviewAll: boolean;
  },
) {
  return prisma.bugReport.findFirst({
    where: canReviewAll ? { id: reportId } : { id: reportId, reporterId: userId },
    include: bugReportDetailInclude,
  });
}

export async function updateBugReportStatus(
  reportId: string,
  solverId: string,
  input: UpdateBugReportStatusInput,
) {
  const existingReport = await prisma.bugReport.findUnique({
    where: { id: reportId },
    select: { id: true },
  });

  if (!existingReport) {
    throw new HttpError(404, "Bug report not found.");
  }

  return prisma.bugReport.update({
    where: { id: reportId },
    data:
      input.status === "SOLVED"
        ? {
            status: "SOLVED",
            solvedAt: new Date(),
            solvedById: solverId,
          }
        : {
            status: "OPEN",
            solvedAt: null,
            solvedById: null,
          },
    include: bugReportDetailInclude,
  });
}

export async function deleteBugReport(reportId: string) {
  const existingReport = await prisma.bugReport.findUnique({
    where: { id: reportId },
    select: { id: true },
  });

  if (!existingReport) {
    throw new HttpError(404, "Bug report not found.");
  }

  await prisma.bugReport.delete({
    where: { id: reportId },
  });

  return { ok: true };
}
