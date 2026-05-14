# Generis Daily Reporting

A Next.js 14 application for employees to review imported Jira, Google Calendar, and Google Tasks activity, submit daily reports, and give reviewers a team reporting dashboard.

## Stack

- Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui-style components
- Auth.js / NextAuth with Atlassian, Google, and credentials providers
- Prisma with managed PostgreSQL through `DATABASE_URL`
- Recharts for reviewer dashboard metrics
- `googleapis` for Calendar and Tasks

Docker is intentionally not used for this MVP.

## Local Setup

1. Install Node.js with `npm` available on PATH. On Windows, `npm.cmd` is the safest command if PowerShell blocks `npm.ps1`.
2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL`
   - `NEXTAUTH_URL`
   - `NEXTAUTH_SECRET`
   - `TOKEN_ENCRYPTION_KEY`
   - Atlassian and Google OAuth client values
   - `ENABLE_PREVIEW_BYPASS=true` only for local demos
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
2. Set `NEXTAUTH_URL` to the production URL, plus `NEXTAUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ATLASSIAN_CLIENT_ID`, and `ATLASSIAN_CLIENT_SECRET`.
3. Set `ENABLE_PREVIEW_BYPASS=false` in production unless a temporary private demo bypass is intentionally needed.
4. Configure OAuth redirect URLs:
   - Local: `http://localhost:3000/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/atlassian`
   - Production: `https://YOUR_DOMAIN/api/auth/callback/google` and `https://YOUR_DOMAIN/api/auth/callback/atlassian`
5. Deploy migrations before first production use:

```bash
npm run db:deploy
npm run db:seed
```

## MVP Notes

- Jira is read-only and imports normalized issue, worklog, and changelog activity.
- Google Calendar imports accepted timed events from the configured calendar.
- Google Tasks imports tasks from selected task lists; if none are selected, all lists are included.
- OAuth tokens are encrypted before being stored in the Auth.js `Account` table, and refreshes persist updated encrypted tokens.
- Employees can revise submitted reports; previous submitted snapshots are retained in `ReportRevision`.
- Reviewer access uses the `REVIEWER` role internally; legacy `/coo` links redirect to `/review`.
