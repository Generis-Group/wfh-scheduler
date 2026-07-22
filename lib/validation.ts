import { z } from "zod";

import { generisEmailMessage, isGenerisEmail } from "@/lib/auth-domain";
import {
  maxBugReportBodyCharacters,
  maxBugReportBodyLines,
  maxBugReportBodyWords,
} from "@/lib/bug-report-limits";
import { isFutureReportDateString, isValidReportDateString } from "@/lib/dates";
import {
  plannedWorkLocationValues,
  workLocationValues,
} from "@/lib/work-locations";

export const dateStringFormatSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .refine(isValidReportDateString, {
    message: "Use a valid date.",
  });

export const dateStringSchema = dateStringFormatSchema.refine(
  (date) => !isFutureReportDateString(date),
  {
    message: "Future dates are not available.",
  },
);

export const reportQuerySchema = z.object({
  date: dateStringSchema,
  userId: z.string().optional(),
});

export const updateReportSchema = z.object({
  summary: z.string().max(8000).optional(),
  workLocation: z.enum(workLocationValues).optional(),
  activityUpdates: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(300).optional(),
        selected: z.boolean().optional(),
        employeeNote: z.string().max(4000).nullable().optional(),
      }),
    )
    .optional(),
  deletedActivityIds: z.array(z.string()).optional(),
  manualActivities: z
    .array(
      z.object({
        id: z.string().min(1).max(200).optional(),
        title: z.string().min(1).max(300),
        description: z.string().max(4000).nullable().optional(),
        selected: z.boolean().optional(),
        status: z.string().max(100).nullable().optional(),
        durationMinutes: z
          .number()
          .int()
          .min(0)
          .max(1440)
          .nullable()
          .optional(),
        startedAt: z.string().datetime().nullable().optional(),
        endedAt: z.string().datetime().nullable().optional(),
        employeeNote: z.string().max(4000).nullable().optional(),
      }),
    )
    .optional(),
});

export const createReportSchema = updateReportSchema.extend({
  date: dateStringSchema,
});

export const plannedWorkLocationSchema = z.object({
  date: dateStringFormatSchema,
  workLocation: z.enum(plannedWorkLocationValues).nullable().optional(),
});

export const workLocationCalendarQuerySchema = z.object({
  date: dateStringFormatSchema.optional(),
  departmentId: z.string().optional(),
});

export const commentSchema = z.object({
  body: z.string().min(1).max(4000),
});

export const reportReadStateSchema = z.object({
  read: z.boolean(),
});

const userRoleSchema = z.enum(["EMPLOYEE", "REVIEWER", "ADMIN"]);
const userRolesSchema = z.array(userRoleSchema).min(1).max(3);

export const createUserSchema = z.object({
  email: z.string().email().refine(isGenerisEmail, generisEmailMessage()),
  name: z.string().min(1).max(200).optional(),
  role: userRoleSchema.optional(),
  roles: userRolesSchema.optional(),
  status: z.enum(["INVITED", "ACTIVE", "DISABLED"]).default("INVITED"),
  temporaryPassword: z.string().min(8).optional(),
  reviewerAllDepartments: z.boolean().optional(),
  departmentIds: z.array(z.string()).optional(),
  employeeDepartmentIds: z.array(z.string()).optional(),
  reviewerDepartmentIds: z.array(z.string()).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(200).nullable().optional(),
  role: userRoleSchema.optional(),
  roles: userRolesSchema.optional(),
  status: z.enum(["INVITED", "ACTIVE", "DISABLED"]).optional(),
  reviewerAllDepartments: z.boolean().optional(),
  departmentIds: z.array(z.string()).optional(),
  employeeDepartmentIds: z.array(z.string()).optional(),
  reviewerDepartmentIds: z.array(z.string()).optional(),
});

export const createDepartmentSchema = z.object({
  name: z.string().min(1).max(120),
});

export const resetPasswordSchema = z.object({
  temporaryPassword: z.string().min(8).optional(),
});

export const signupSchema = z.object({
  email: z.string().email().refine(isGenerisEmail, generisEmailMessage()),
  name: z.string().min(1).max(200).optional(),
  password: z.string().min(8).max(200),
  departmentIds: z.array(z.string()).min(1, "Choose at least one department."),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email().refine(isGenerisEmail, generisEmailMessage()),
});

export const passwordResetConfirmSchema = z.object({
  email: z.string().email().refine(isGenerisEmail, generisEmailMessage()),
  token: z.string().min(24).max(300),
  password: z.string().min(8).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export const accountProfileSchema = z.object({
  name: z.string().max(200).nullable().optional(),
  email: z.string().email().refine(isGenerisEmail, generisEmailMessage()),
  image: z
    .union([
      z
        .string()
        .max(350_000)
        .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
      z.string().url().max(2000),
    ])
    .nullable()
    .optional(),
});

export const bugReportAttachmentSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataUrl: z
    .string()
    .max(1_200_000)
    .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
  sizeBytes: z.number().int().min(1).max(900_000),
});

function bugReportBodyStats(value: string) {
  return {
    words: value.trim() ? (value.trim().match(/\S+/g)?.length ?? 0) : 0,
    lines: value.length > 0 ? value.split(/\r\n|\r|\n/).length : 0,
  };
}

const bugReportBodyLimitMessage = `Bug reports can be up to ${maxBugReportBodyWords} words, ${maxBugReportBodyLines} lines, and ${maxBugReportBodyCharacters} characters.`;
const bugReportBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(maxBugReportBodyCharacters)
  .refine(
    (value) => bugReportBodyStats(value).words <= maxBugReportBodyWords,
    bugReportBodyLimitMessage,
  )
  .refine(
    (value) => bugReportBodyStats(value).lines <= maxBugReportBodyLines,
    bugReportBodyLimitMessage,
  );

export const createBugReportSchema = z.object({
  body: bugReportBodySchema,
  pagePath: z.string().max(500).nullable().optional(),
  userAgent: z.string().max(1000).nullable().optional(),
  attachments: z.array(bugReportAttachmentSchema).max(4).default([]),
});

export const updateBugReportStatusSchema = z.object({
  status: z.enum(["OPEN", "SOLVED"]),
});

export const companySettingsSchema = z.object({
  jiraProjectKeys: z.array(z.string().min(1)).default([]),
});

export const userIntegrationSettingsSchema = z.object({
  jiraCloudId: z.string().nullable().optional(),
  googleCalendarId: z.string().min(1).optional(),
  googleTaskListIds: z.array(z.string()).optional(),
});

export const syncSchema = z.object({
  date: dateStringSchema,
});

export const reviewDigestSchema = z.object({
  date: dateStringSchema,
  filters: z
    .object({
      search: z.string().max(200).optional(),
    })
    .optional(),
});

export const reportReminderSchema = z.object({
  date: dateStringSchema,
  userId: z.string().min(1),
});

export const weeklyReportQuerySchema = z.object({
  date: dateStringSchema,
  userId: z.string().min(1),
});

export const departmentReportQuerySchema = z.object({
  date: dateStringSchema,
  period: z.enum(["DAILY", "WEEKLY"]),
});

export const weeklyReportListQuerySchema = z.object({
  userId: z.string().min(1),
});

export const weeklyReportIdSchema = z.object({
  id: z.string().min(1),
});
