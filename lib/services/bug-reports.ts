import type { z } from "zod";

import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { hasUserRole, type RoleBearingUser } from "@/lib/roles";
import type {
  createBugReportSchema,
  updateBugReportStatusSchema,
} from "@/lib/validation";

type CreateBugReportInput = z.infer<typeof createBugReportSchema>;
type UpdateBugReportStatusInput = z.infer<typeof updateBugReportStatusSchema>;

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

export async function listVisibleBugReports({
  userId,
  canReviewAll,
}: {
  userId: string;
  canReviewAll: boolean;
}) {
  return prisma.bugReport.findMany({
    where: canReviewAll ? undefined : { reporterId: userId },
    include: bugReportListInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
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
