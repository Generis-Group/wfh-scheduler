# Generis Daily Reporting

A Next.js 14 application for employees to review imported Jira, Google Calendar, and Google Tasks activity, submit daily reports, and give reviewers a team reporting dashboard.

## Stack

- Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui-style components
- Auth.js / NextAuth with Atlassian, Google, and credentials providers
- Prisma with managed PostgreSQL through `DATABASE_URL`
- Recharts for reviewer dashboard metrics
- `googleapis` for Calendar and Tasks
- Google Gen AI SDK for Gemini-powered features authenticated with each user's connected Google account

Docker is intentionally not used for this MVP.

## Local Setup

1. Install Node.js 20+ with `npm` available on PATH. On Windows, `npm.cmd` is the safest command if PowerShell blocks `npm.ps1`.
2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL`
   - `NEXTAUTH_URL`
   - `NEXTAUTH_SECRET`
   - `TOKEN_ENCRYPTION_KEY`
   - Atlassian and Google OAuth client values
   - Gemini values: `GOOGLE_CLOUD_QUOTA_PROJECT` (or `GOOGLE_CLOUD_PROJECT`) with the Gemini API enabled, optional `GEMINI_MODEL`
   - Resend email values: `RESEND_API_KEY`, optional `EMAIL_FROM`, `APP_BASE_URL`, and `CRON_SECRET`
3. Install dependencies:

```bash
npm install
```

4. Create the database schema and seed the initial admin:

```bash
npm run db:migrate
npm run db:seed
```

5. Start the app:

```bash
npm run dev
```

## Useful Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run db:generate
npm run db:deploy
```

## Vercel + Managed Postgres

1. Create a managed Postgres database and set `DATABASE_URL` in Vercel.
2. Set `NEXTAUTH_URL` and `APP_BASE_URL` to the production URL, plus `NEXTAUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET`, `GOOGLE_CLOUD_QUOTA_PROJECT` (or `GOOGLE_CLOUD_PROJECT`), `RESEND_API_KEY`, and `CRON_SECRET`. `GEMINI_MODEL` defaults to `gemini-2.5-flash`, and `EMAIL_FROM` defaults to `Generis Reports <reports@generisgp.com>`; set them only when overriding those defaults.
3. Configure OAuth redirect URLs:
   - Local: `http://localhost:3000/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/atlassian`
   - Production: `https://YOUR_DOMAIN/api/auth/callback/google` and `https://YOUR_DOMAIN/api/auth/callback/atlassian`
   - Atlassian must include both the Jira API scopes and the User Identity API `read:me` scope: `read:me read:jira-user read:jira-work offline_access`.
4. Deploy migrations before first production use:

```bash
npm run db:deploy
npm run db:seed
```

5. Vercel Cron is configured in `vercel.json` to call `/api/cron/review-digest` once per weekday evening. The route checks `CRON_SECRET` and skips duplicate scheduled digests for the same report date.

## MVP Notes

- Jira is read-only and imports normalized issue, worklog, and changelog activity.
- Google Calendar imports accepted timed events from the configured calendar.
- Google Tasks imports tasks from selected task lists; if none are selected, all lists are included.
- OAuth tokens are encrypted before being stored in the Auth.js `Account` table, and refreshes persist updated encrypted tokens.
- Gemini requests use the user's connected Google OAuth token plus `x-goog-user-project`; users who connected Google before the Gemini scopes were added must reconnect Google once.
- Sign-in and admin-created accounts are restricted to `@generisgp.com` email addresses.
- Reviewer digest emails use Resend; manual digests go to the sender, scheduled digests are sent separately to each active reviewer with that recipient's review scope, and include coverage, missing reports, late/edit flags, and a link back to the review dashboard.
- Transactional email also uses Resend for admin-created account invites, temporary password resets, reviewer report reminders, reviewer comment notifications, and admin bug report notifications. The default verified sender is `Generis Reports <reports@generisgp.com>`; set `EMAIL_FROM` only if a different verified sender should be used.
- Employees can revise submitted reports; previous submitted snapshots are retained in `ReportRevision`.
- Reviewer access uses the `REVIEWER` role internally.
