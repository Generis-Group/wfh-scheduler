import { describe, expect, it } from "vitest";

import { normalizeCalendarEvent } from "@/lib/normalizers/google-calendar";
import { normalizeGoogleTask } from "@/lib/normalizers/google-tasks";
import { normalizeJiraChangelog, normalizeJiraIssue, normalizeJiraWorklog } from "@/lib/normalizers/jira";

describe("provider normalizers", () => {
  it("normalizes Jira issues, worklogs, and changelogs without raw payload retention", () => {
    const issue = {
      id: "10001",
      key: "GEN-42",
      fields: {
        summary: "Finish daily report app",
        updated: "2026-05-13T14:15:00.000Z",
        status: { name: "In Progress" },
        assignee: { displayName: "Alex", accountId: "a1" },
        reporter: { displayName: "Sam", accountId: "s1" }
      }
    };

    expect(normalizeJiraIssue(issue, "https://generis.atlassian.net")).toMatchObject({
      source: "JIRA",
      sourceId: "issue:10001",
      sourceContainerId: "GEN-42",
      title: "GEN-42: Finish daily report app",
      sourceUrl: "https://generis.atlassian.net/browse/GEN-42"
    });

    expect(
      normalizeJiraWorklog(
        issue,
        {
          id: "500",
          started: "2026-05-13T13:00:00.000Z",
          timeSpentSeconds: 3600,
          author: { displayName: "Alex", accountId: "a1" }
        },
        "https://generis.atlassian.net"
      )
    ).toMatchObject({
      sourceId: "worklog:500",
      durationMinutes: 60
    });

    expect(
      normalizeJiraChangelog(
        issue,
        {
          id: "700",
          created: "2026-05-13T15:00:00.000Z",
          author: { displayName: "Alex", accountId: "a1" },
          items: [{ field: "status", fromString: "To Do", toString: "In Progress" }]
        },
        "https://generis.atlassian.net"
      )
    ).toMatchObject({
      sourceId: "changelog:10001:700",
      title: "GEN-42: changed status"
    });
  });

  it("excludes cancelled, declined, and all-day calendar events", () => {
    expect(
      normalizeCalendarEvent({
        id: "cancelled",
        status: "cancelled",
        start: { dateTime: "2026-05-13T13:00:00-04:00" },
        end: { dateTime: "2026-05-13T13:30:00-04:00" }
      })
    ).toBeNull();

    expect(
      normalizeCalendarEvent({
        id: "all-day",
        summary: "Company offsite",
        start: { date: "2026-05-13" },
        end: { date: "2026-05-14" }
      })
    ).toBeNull();

    expect(
      normalizeCalendarEvent(
        {
          id: "declined",
          summary: "Planning",
          start: { dateTime: "2026-05-13T13:00:00-04:00" },
          end: { dateTime: "2026-05-13T13:30:00-04:00" },
          attendees: [{ email: "employee@generisgp.com", responseStatus: "declined" }]
        },
        "employee@generisgp.com"
      )
    ).toBeNull();
  });

  it("normalizes accepted calendar events and Google Tasks", () => {
    expect(
      normalizeCalendarEvent(
        {
          id: "meeting-1",
          summary: "Reviewer check-in",
          htmlLink: "https://calendar.google.com/event",
          start: { dateTime: "2026-05-13T09:00:00-04:00" },
          end: { dateTime: "2026-05-13T09:30:00-04:00" },
          attendees: [
            { email: "employee@generisgp.com", responseStatus: "accepted" },
            { email: "reviewer@generisgp.com", responseStatus: "accepted" }
          ]
        },
        "employee@generisgp.com"
      )
    ).toMatchObject({
      source: "GOOGLE_CALENDAR",
      sourceId: "meeting-1",
      durationMinutes: 30,
      status: "accepted"
    });

    expect(
      normalizeGoogleTask(
        {
          id: "task-1",
          title: "Office task",
          status: "completed",
          completed: "2026-05-13T18:00:00.000Z"
        },
        "list-1",
        "Office"
      )
    ).toMatchObject({
      source: "GOOGLE_TASKS",
      sourceId: "task-1",
      sourceContainerId: "list-1",
      status: "completed"
    });
  });
});
