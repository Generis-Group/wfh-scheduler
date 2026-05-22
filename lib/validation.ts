import { z } from "zod";

import { generisEmailMessage, isGenerisEmail } from "@/lib/auth-domain";

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export const reportQuerySchema = z.object({
  date: dateStringSchema,
  userId: z.string().optional()
});

export const updateReportSchema = z.object({
  summary: z.string().max(8000).optional(),
  blockers: z.string().max(8000).optional(),
  workLocation: z
    .enum(["OFFICE", "WFH", "HYBRID", "PTO", "OUT_OF_OFFICE", "UNKNOWN"])
    .optional(),
  activityUpdates: z
    .array(
      z.object({
        id: z.string(),
        selected: z.boolean().optional(),
        employeeNote: z.string().max(4000).nullable().optional()
      })
    )
    .optional(),
  deletedActivityIds: z.array(z.string()).optional(),
  manualActivities: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        description: z.string().max(4000).nullable().optional(),
        status: z.string().max(100).nullable().optional(),
        durationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
        startedAt: z.string().datetime().nullable().optional(),
        endedAt: z.string().datetime().nullable().optional(),
        employeeNote: z.string().max(4000).nullable().optional()
      })
    )
    .optional()
});

export const createReportSchema = updateReportSchema.extend({
  date: dateStringSchema
});

export const commentSchema = z.object({
  body: z.string().min(1).max(4000)
});

export const reportReadStateSchema = z.object({
  read: z.boolean()
});

export const createUserSchema = z.object({
  email: z.string().email().refine(isGenerisEmail, generisEmailMessage()),
  name: z.string().min(1).max(200).optional(),
  role: z.enum(["EMPLOYEE", "REVIEWER", "ADMIN"]).default("EMPLOYEE"),
  status: z.enum(["INVITED", "ACTIVE", "DISABLED"]).default("INVITED"),
  temporaryPassword: z.string().min(8).optional(),
  reviewerAllDepartments: z.boolean().optional(),
  departmentIds: z.array(z.string()).optional()
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(200).nullable().optional(),
  role: z.enum(["EMPLOYEE", "REVIEWER", "ADMIN"]).optional(),
  status: z.enum(["INVITED", "ACTIVE", "DISABLED"]).optional(),
  reviewerAllDepartments: z.boolean().optional(),
  departmentIds: z.array(z.string()).optional()
});

export const createDepartmentSchema = z.object({
  name: z.string().min(1).max(120)
});

export const resetPasswordSchema = z.object({
  temporaryPassword: z.string().min(8).optional()
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200)
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
      z.string().url().max(2000)
    ])
    .nullable()
    .optional()
});

export const companySettingsSchema = z.object({
  jiraProjectKeys: z.array(z.string().min(1)).default([])
});

export const userIntegrationSettingsSchema = z.object({
  jiraCloudId: z.string().nullable().optional(),
  googleCalendarId: z.string().min(1).optional(),
  googleTaskListIds: z.array(z.string()).optional()
});

export const syncSchema = z.object({
  date: dateStringSchema
});

export const reviewDigestSchema = z.object({
  date: dateStringSchema,
  filters: z
    .object({
      search: z.string().max(200).optional()
    })
    .optional()
});
