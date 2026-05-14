import { z } from "zod";

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

export const commentSchema = z.object({
  body: z.string().min(1).max(4000)
});

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200).optional(),
  role: z.enum(["EMPLOYEE", "REVIEWER", "ADMIN"]).default("EMPLOYEE"),
  status: z.enum(["INVITED", "ACTIVE", "DISABLED"]).default("INVITED"),
  temporaryPassword: z.string().min(8).optional()
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(200).nullable().optional(),
  role: z.enum(["EMPLOYEE", "REVIEWER", "ADMIN"]).optional(),
  status: z.enum(["INVITED", "ACTIVE", "DISABLED"]).optional(),
  timezone: z.string().min(1).max(100).optional()
});

export const resetPasswordSchema = z.object({
  temporaryPassword: z.string().min(8).optional()
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200)
});

export const companySettingsSchema = z.object({
  emailDomains: z.array(z.string().min(1)).default([]),
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
