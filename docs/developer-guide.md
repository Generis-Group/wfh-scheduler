# Developer Guide

## Overview

This is a Next.js 14 App Router application for daily reporting and work-location planning.

Core capabilities:

- Credentials, Google, and Atlassian authentication.
- Role-based access for employees, reviewers, and admins.
- Daily report drafts and submitted revisions.
- Imported work items from Jira, Google Calendar, Google Tasks, Gmail, Google Chat, and HubSpot.
- Gemini-assisted summaries and AI imports.
- Weekly work-location planning and a WFH calendar.
- Reviewer dashboards, weekly report snapshots, reminders, and email digests.
- Admin user, department, report, company setting, and bug report management.

## Stack

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- Prisma 6
- PostgreSQL
- NextAuth/Auth.js
- Google APIs
- Atlassian OAuth APIs
- HubSpot CRM APIs
- Gemini through Google OAuth
- Resend-compatible email sending
- Vitest and Playwright

## Important Directories

- `app/`: Next.js routes and API routes.
- `components/`: UI components and feature screens.
- `lib/`: services, integrations, validators, auth, dates, and utilities.
- `lib/services/`: server-side business logic.
- `lib/integrations/`: external API clients.
- `lib/normalizers/`: source-specific activity normalization.
- `prisma/`: schema, migrations, and seed.
- `test/`: Vitest and Playwright tests.
- `docs/`: project documentation.

## Local Setup

Use Node.js 20 or newer.

```powershell
npm.cmd install
```

Create `.env.local` with the required values for the features you need.

Common required values:

```env
DATABASE_URL=
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=
TOKEN_ENCRYPTION_KEY=
```

OAuth and integration values:

```env
ATLASSIAN_CLIENT_ID=
ATLASSIAN_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_QUOTA_PROJECT=
GEMINI_MODEL=gemini-2.5-flash
```

Email values:

```env
RESEND_API_KEY=
EMAIL_FROM=Generis Reports <reports@generisgp.com>
APP_BASE_URL=http://localhost:3000
CRON_SECRET=
```

HubSpot logged-hours values:

```env
HUBSPOT_PRIVATE_APP_TOKEN=
HUBSPOT_LOGGED_HOURS_OBJECT_TYPE=
HUBSPOT_LOGGED_HOURS_DATE_PROPERTY=
HUBSPOT_LOGGED_HOURS_DURATION_PROPERTY=
HUBSPOT_LOGGED_HOURS_USER_EMAIL_PROPERTY=
HUBSPOT_LOGGED_HOURS_DURATION_UNIT=hours
HUBSPOT_LOGGED_HOURS_USER_MATCH_MODE=emailProperty
HUBSPOT_LOGGED_HOURS_DATE_FILTER_FORMAT=epochMillis
HUBSPOT_LOGGED_HOURS_TITLE_PROPERTIES=task_name,project_name,name,title,subject
HUBSPOT_LOGGED_HOURS_DESCRIPTION_PROPERTIES=description,notes,comment
HUBSPOT_LOGGED_HOURS_STATUS_PROPERTY=
HUBSPOT_LOGGED_HOURS_URL_PROPERTY=
```

Run migrations and generate Prisma:

```powershell
npm.cmd run db:migrate
npm.cmd run db:generate
```

Seed the first admin when needed:

```powershell
$env:INITIAL_ADMIN_EMAIL="admin@generisgp.com"
$env:INITIAL_ADMIN_PASSWORD="temporary-password"
npm.cmd run db:seed
```

Start the app:

```powershell
npm.cmd run dev
```

## Useful Commands

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run db:migrate
npm.cmd run db:deploy
npm.cmd run db:seed
```

## Authentication

Auth is configured through NextAuth.

Supported auth paths:

- Credentials accounts.
- Google OAuth.
- Atlassian OAuth.
- Self-service signup with email verification.
- Password reset by email.

All app users must have an `@generisgp.com` email address. This is enforced in `lib/auth-domain.ts` and validation schemas.

OAuth tokens are stored in the Auth.js `Account` table and encrypted by the custom auth adapter/token helpers.

## Roles And Access

Roles are additive. A user may have any combination of:

- `EMPLOYEE`
- `REVIEWER`
- `ADMIN`

The legacy `User.role` field mirrors the primary role. The `User.roles` array is the main source for additive access.

Role helpers live in `lib/roles.ts`.

Access helpers live in `lib/access.ts`.

Rules:

- Employees need at least one employee department.
- Reviewers need a reviewer scope: selected departments or all departments.
- Admins can manage the app.
- Reviewer visibility is department-scoped unless the reviewer has all-departments scope.
- Admin review and location visibility includes all active employees.
- A user cannot remove their own admin access or disable their own account through admin editing.

## Data Model

Main Prisma models:

- `User`: app account, roles, status, and integration settings.
- `Department`: team grouping.
- `UserDepartment`: department membership scoped by role.
- `DailyReport`: one report per user per date.
- `ActivityItem`: manual or imported work item.
- `PlannedWorkLocation`: planned location for a user and date.
- `WeeklyReport`: saved weekly snapshot.
- `SyncRun`: import run status and counts.
- `ReportRevision`: submitted report snapshots before edits.
- `ReportComment`: reviewer/admin comments.
- `ReportReadReceipt`: reviewer read state.
- `BugReport` and `BugReportAttachment`: app issue reporting.
- `EmailRun`: review digest history.
- `AppSetting`: company-wide settings.

Important uniqueness rules:

- One daily report per `userId` and `reportDate`.
- One planned location per `userId` and `workDate`.
- One imported activity per `userId`, `reportDate`, `source`, and `sourceId`.
- One saved weekly report per employee and week start.

## Daily Report Flow

Main service: `lib/services/reports.ts`.

Daily report behavior:

1. `ensureDailyReport` creates the draft shell for a user/date.
2. Imported and manual work items attach to that report.
3. `updateReport` saves summary, location, selected state, manual items, renamed titles, and deletions.
4. `submitReport` validates that a real work location is selected.
5. Submitted reports can be edited. Before changes, the app stores a `ReportRevision`.
6. Admins can reopen or delete submitted reports through admin routes.

Submit readiness lives in `lib/report-submit-readiness.ts`.

Current submit rules:

- Work location must be real, not `UNKNOWN`.
- The report must have selected work items, manual work items, summary text, or `OUT_OF_OFFICE`.

## Work Locations

Location helpers live in `lib/work-locations.ts`.

Daily report values:

- `OFFICE`
- `WFH`
- `OFFICE_AM_WFH_PM`
- `WFH_AM_OFFICE_PM`
- `OUT_OF_OFFICE`
- `UNKNOWN`

Legacy `PTO` values normalize to `OUT_OF_OFFICE`.

Planned work-location values exclude `UNKNOWN` and only store real planned states.

The locations page data comes from `lib/services/work-location-plans.ts`.

The weekly list and WFH calendar use the same endpoint:

- Submitted daily reports are preferred for a day.
- Planned locations are used when no submitted report exists.
- Reviewer/admin visibility is scoped by department access.
- Admins can see all employees unless a department filter is applied.

## Activity Imports

Main service: `lib/services/sync.ts`.

Each import creates a `SyncRun`, emits progress messages, normalizes source records, then saves through `upsertImportedActivities`.

Supported providers:

- `JIRA`
- `GOOGLE_CALENDAR`
- `GOOGLE_TASKS`
- `GMAIL`
- `GOOGLE_CHAT`
- `HUBSPOT`

### Imported Activity Persistence

`lib/services/activity.ts` handles imported activity persistence.

Behavior:

- Invalid normalized items are skipped.
- Duplicate imports are merged before persistence.
- Existing imported items are updated in place.
- Manually deselected imported items stay deselected on re-import.
- Items missing from a later import are marked stale.
- Related source links are stored in metadata so the UI can show a link picker.

Duplicate detection uses source ids, related source links, Jira keys, Google Task ids/URLs, message ids, source containers, and similar task titles.

## Jira Import

Jira uses Atlassian OAuth.

Scopes are defined in `lib/oauth-scopes.ts`:

```text
read:me read:jira-user read:jira-work offline_access
```

The import:

- Finds issues updated by the current user.
- Finds issues with current-user worklogs.
- Reads worklogs, changelog, and comments.
- Normalizes activity through `lib/normalizers/jira.ts`.
- Can be limited by company Jira project keys in settings.

## Google Calendar Import

Google Calendar uses the configured calendar id from `UserIntegrationSettings`.

The import:

- Reads accepted timed events for the report day.
- Normalizes events through `lib/normalizers/google-calendar.ts`.
- Skips irrelevant calendar records in the normalizer.

## Google Tasks Import

Google Tasks uses selected task list ids from `UserIntegrationSettings`.

If no task lists are selected, all task lists are included.

The import:

- Reads completed tasks for the report day.
- Normalizes tasks through `lib/normalizers/google-tasks.ts`.
- Supports manual Google Task references.

## Gmail AI Import

Gmail import uses Google OAuth and Gemini.

The import:

- Searches same-day sent threads.
- Fetches full threads for those candidates.
- Includes same-day messages in those threads as AI evidence.
- Uses Gemini to extract report-worthy work items.
- Saves only derived `ActivityItem` records.
- Does not persist raw Gmail bodies.

Gmail scopes are in `GOOGLE_OAUTH_SCOPE`.

Users who connected Google before Gmail/Gemini scopes were added must reconnect Google.

## Google Chat AI Import

Google Chat import uses Google OAuth and Gemini.

The import:

- Lists visible Chat spaces.
- Reads same-day messages in spaces that could have activity.
- Groups messages into conversation evidence.
- Uses the current user's Chat identity to focus on the user's participation.
- Filters automated or low-value conversations through AI extraction and dedupe.
- Saves only derived `ActivityItem` records.

Google Chat can fail if the Workspace admin has not allowed the app to read Chat.

## HubSpot Logged Hours Import

HubSpot import uses a private app token and configurable property mappings.

The import:

- Searches configured HubSpot object records.
- Filters by report date and user email or owner id.
- Reads duration from the configured duration property.
- Normalizes records through `lib/normalizers/hubspot.ts`.
- Saves records as `HUBSPOT` activities.

Required configuration:

- `HUBSPOT_PRIVATE_APP_TOKEN`
- `HUBSPOT_LOGGED_HOURS_OBJECT_TYPE`
- `HUBSPOT_LOGGED_HOURS_DATE_PROPERTY`
- `HUBSPOT_LOGGED_HOURS_DURATION_PROPERTY`
- `HUBSPOT_LOGGED_HOURS_USER_EMAIL_PROPERTY`

Optional configuration controls date format, duration unit, title fields, description fields, status field, URL field, and owner matching.

## Gemini

Gemini client code lives in `lib/integrations/gemini.ts`.

The app calls Gemini using the signed-in user's Google OAuth token plus a Google Cloud quota project.

Required:

- `GOOGLE_CLOUD_QUOTA_PROJECT` or `GOOGLE_CLOUD_PROJECT`

Optional:

- `GEMINI_MODEL`

Default model:

```text
gemini-2.5-flash
```

Gemini is used for:

- Summary generation.
- Gmail activity extraction.
- Google Chat activity extraction.
- AI import quality checks.

## Email

Email is used for:

- Signup verification.
- Password reset.
- Admin-created temporary passwords.
- Reviewer reminders.
- Reviewer comments.
- Review digests.
- Bug report notifications.

Review digest logic is in `lib/services/email-digest.ts`.

Scheduled review digests are triggered by `/api/cron/review-digest` and configured in `vercel.json`.

Scheduled digests are sent separately to each active reviewer and scoped to that reviewer's visibility.

## API Routes

Important API groups:

- `/api/auth/*`: authentication, signup, password reset.
- `/api/reports/*`: daily report loading, saving, submitting, comments, read state, history, AI summary.
- `/api/sync/*`: source imports.
- `/api/review/*`: reviewer dashboards, weekly reports, reminders, digests.
- `/api/work-location-calendar`: weekly list and WFH calendar data.
- `/api/work-location-plans`: create/update/delete own planned locations.
- `/api/admin/*`: admin users, departments, reports, settings.
- `/api/settings/*`: user integration settings.
- `/api/bug-reports/*`: bug report CRUD/status.
- `/api/cron/review-digest`: scheduled digest job.

Validation schemas live in `lib/validation.ts`.

## UI Structure

Main feature components:

- `components/reports/daily-report-app.tsx`
- `components/reports/reviewer-dashboard.tsx`
- `components/reports/report-history.tsx`
- `components/reports/work-location-calendar.tsx`
- `components/admin/admin-users.tsx`
- `components/admin/admin-reports-manager.tsx`
- `components/settings/settings-panel.tsx`
- `components/bugs/bug-report-page.tsx`

Shared UI primitives live in `components/ui`.

Global styles live in `app/globals.css`.

## Date Handling

Date helpers live in `lib/dates.ts` and `lib/date-only.ts`.

The app stores report dates as database dates and uses report date strings in `YYYY-MM-DD` format at API boundaries.

Avoid ad hoc local-time parsing for report dates. Use existing helpers such as:

- `parseReportDate`
- `reportDateString`
- `zonedDayRange`
- `reportWorkWeekRange`
- `addReportDateDays`

## Privacy Rules

Do not persist raw Gmail or Google Chat body text.

AI imports should save derived activity data only:

- title
- description
- status
- confidence/reason metadata when useful
- message ids or thread/conversation ids
- source links
- timestamps
- source/provider metadata

The app should store enough metadata to dedupe and trace source records without storing private raw messages.

## Testing

Use focused tests while developing, then run broader checks before commit.

Common final checks:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
```

Useful focused suites:

- `test/report-service.test.ts`
- `test/report-ui.test.ts`
- `test/reviewer-dashboard.test.tsx`
- `test/work-location-plans.test.ts`
- `test/work-location-calendar.test.tsx`
- `test/sync-service.test.ts`
- `test/gmail-ai-import.test.ts`
- `test/google-chat-ai-import.test.ts`
- `test/hubspot-integration.test.ts`
- `test/admin-service.test.ts`
- `test/bug-reports.test.ts`

Use Playwright for browser-level checks:

```powershell
npm.cmd run test:e2e
```

## Deployment Notes

Production deployment expects:

- PostgreSQL database.
- Prisma migrations deployed with `npm.cmd run db:deploy`.
- NextAuth URL and secret configured.
- Token encryption key configured.
- OAuth callback URLs configured for production.
- Email provider configured if signup, reset, invites, reminders, comments, or digests are needed.
- Google Cloud project configured for Gemini.
- HubSpot private app token and mapping configured if HubSpot import is needed.

After adding new OAuth scopes, users may need to reconnect the affected provider.

After adding enum values or tables, deploy migrations before users try the feature.

## Common Development Rules

- Keep roles additive. Use `roles` and helpers from `lib/roles.ts`.
- Keep employee departments and reviewer departments separate.
- Use service functions for business logic instead of duplicating it in routes.
- Use Zod schemas from `lib/validation.ts` for API input.
- Use existing date helpers for report dates.
- Use `upsertImportedActivities` for imported activities.
- Use stable source ids for imports.
- Preserve manually deselected imported items.
- Mark stale imports instead of deleting current history.
- Do not persist raw Gmail or Chat message bodies.
- Reuse shared UI primitives and global scroll/layout patterns.
- Add tests near the behavior being changed.
