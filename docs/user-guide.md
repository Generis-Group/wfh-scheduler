# User Guide

## What This App Does

The app helps Generis employees report what they worked on each day and where they worked from. It also helps reviewers see team reporting status, review daily reports, and check work-from-home patterns.

The main areas are:

- **Daily update**: submit your daily report.
- **My reports**: view your past reports and saved weekly reports.
- **Locations**: plan work locations and view team work-location calendars.
- **Team review**: review employee reports.
- **Admin**: manage users, departments, reports, and company settings.
- **Bug reports**: report app issues and track them.
- **Settings**: update your profile and connect integrations.

## Accounts And Roles

Every account must use an `@generisgp.com` email address.

Users can have one or more roles:

- **Employee**: can submit daily reports and plan their own work locations.
- **Reviewer**: can review reports for assigned departments or all departments.
- **Admin**: can manage the app. Admin access does not automatically mean a person reviews every department unless reviewer access is also assigned.

Employees must belong to at least one employee department. Reviewers must have a reviewer scope: either selected departments or all departments.

## Signing In

Sign in from the login page with your account credentials.

If your organization allows self-signup:

1. Open the signup flow from the login page.
2. Enter your `@generisgp.com` email.
3. Choose at least one department.
4. Check your email and confirm the signup link.

If an admin created your account, you may receive a temporary password. You will be asked to change it after signing in.

## Daily Update

Use **Daily update** to create or edit your report for a selected day.

### Choose The Date

Use the date controls at the top of the page to move between days.

Future dates are not available for daily reports.

### Choose Work Location

You must choose a real work location before submitting.

The daily location options are:

- **Office**
- **WFH**
- **Office AM / WFH PM**
- **WFH AM / Office PM**
- **Out of office**

**Unspecified** means the report is not ready to submit.

If you planned a location for the day and choose a different location in the daily report, the daily report is treated as the actual source of truth after submission.

### Work Items

Work items are the tasks or activities that support your daily report.

You can:

- **Add item**: create a manual item.
- **Clear**: remove all current work items from the report.
- **Import**: pull work items from connected sources.
- **Search**: filter the current list.
- **Rename**: edit a work item title.
- **Remove**: remove one item from the report.
- **Copy title**: copy the item title.
- **Open source**: open the linked source. If an item has multiple related links, you can choose which one to open.

Checked work items are included in the report. Unchecked items stay visible but are not included in the submitted report summary.

### Imports

The import menu can pull items from:

- **Jira**
- **Google Calendar**
- **Google Tasks**
- **Gmail with AI**
- **Google Chat with AI**
- **HubSpot**

Imports only add derived activity records. Gmail and Google Chat AI imports do not store raw message bodies.

If the same task appears more than once, the app tries to merge it into one work item and keep related links together.

Re-importing the same source updates existing imported items. If a previously imported item no longer appears in the source, the app marks it stale instead of showing it as current.

### Summary

Use the **Summary** editor to write what you worked on.

You can:

- Type your own summary.
- Use basic formatting.
- Drag work items into the summary as references.
- Use the Gemini button to generate a draft summary from selected work items.

The summary should describe the actual work done, not just repeat tool activity.

### Save And Submit

The app saves drafts as you work.

You can submit when:

- A real work location is selected.
- The report has content, selected work items, manual items, or is marked out of office.

After submission, you can still edit and resubmit. The app keeps previous submitted snapshots as revisions.

## My Reports

Use **My reports** to see your past reports.

You can search and filter report history, open a submitted or draft report, and view saved weekly report snapshots when available.

## Locations

Use **Locations** to plan where you expect to work and to see where your department is working.

### My Week

The **My week** section lets you plan your expected location for each day of the selected week.

Plan options are:

- **Office**
- **WFH**
- **Office AM / WFH PM**
- **WFH AM / Office PM**
- **Out of office**
- **No plan**

Plans are for future coordination. A submitted daily report is the final record for that day.

### Weekly List

The weekly list shows people as rows and days as columns.

Each cell shows:

- A submitted report location, when a report exists.
- A planned location, when no submitted report exists.
- A blank value when there is no report and no plan.

You can search people by name, email, or department. You can also filter by department and jump between weeks.

### WFH Calendar

The **WFH calendar** shows a month view focused on WFH and half-day WFH.

Visual bars show who is WFH:

- Full bar: full-day WFH.
- Left half bar: WFH AM / Office PM.
- Right half bar: Office AM / WFH PM.

If a day has more names than can fit, use the overflow control on that day to see everyone.

## Team Review

Reviewers use **Team review** to check report coverage and review submitted work.

Reviewer visibility is based on reviewer department scope. Admins can see all active employees in review and location views.

In Team review, you can:

- Pick a report date.
- Search employees.
- See submitted, draft, missing, late, and edited reports.
- Open report details.
- Add review comments.
- Mark reports read or unread.
- Send reminders for missing reports.
- Send a manual digest email.
- Generate or view weekly report snapshots.

Weekly reports include activity summaries and work-location breakdowns for the employee.

## Admin

Admins use **Admin** to manage app setup.

### Team

Admins can:

- Create users.
- Edit user names, roles, status, employee departments, and reviewer scope.
- Reset passwords.
- Delete a user's report data when needed.

When creating reviewer accounts, choose **Reviewer** and set a reviewer scope. When creating admin-reviewer accounts, choose both **Admin** and **Reviewer**.

### Departments

Admins can create and manage departments.

Departments are used for:

- Employee membership.
- Reviewer scope.
- Location calendar visibility.
- Team review visibility.

### Reports

Admins can manage submitted reports, including reopening or deleting submitted reports when needed.

### Company Settings

Company settings include shared rules such as Jira project keys. Jira imports use these keys to limit which Jira projects are included.

## Settings

Use **Settings** to manage your account and integrations.

### Account

You can update your name, email, image, and password.

The email must remain an `@generisgp.com` address.

### Integrations

Connect or reconnect integrations from Settings.

Common cases:

- Reconnect Google after new Google scopes are added.
- Choose a Google Calendar.
- Choose Google Task lists.
- Choose a Jira site if your account has more than one.

If Gmail, Chat, Gemini, Calendar, or Tasks fail because access is blocked, reconnect Google first. If it still fails, the Google Workspace app permissions may need admin approval.

## Bug Reports

Use **Bug reports** to report problems with the app.

You can include text and screenshots. Admins can view all bug reports, mark them solved, reopen them, or delete them.

## Common Problems

### I Cannot Submit My Daily Report

Check that:

- Work location is not **Unspecified**.
- You added content, selected work items, manual work items, or chose **Out of office**.

### Import Failed

Try reconnecting the related integration in **Settings**.

For Google imports, reconnect Google and approve the requested access. If it still fails, the Workspace admin may need to allow this app.

For HubSpot imports, an admin must configure the HubSpot private app token and logged-hours property mapping.

### Imported Items Look Duplicated

Re-run the import. The app attempts to merge duplicate items by source ids, related links, Jira keys, task ids, message ids, and similar task titles.

If duplicates remain, remove the extra item manually and report the case as a bug.

### I Do Not See Someone In Team Review Or Locations

Check:

- The person is active.
- The person has the Employee role.
- The person has at least one employee department.
- Your reviewer scope includes that department.

Admins can update this in **Admin > Team**.
