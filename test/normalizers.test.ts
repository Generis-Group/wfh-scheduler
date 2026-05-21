import { describe, expect, it } from "vitest";

import { normalizeCalendarEvent } from "@/lib/normalizers/google-calendar";
import { normalizeGoogleTask } from "@/lib/normalizers/google-tasks";
import { normalizeJiraIssueDay } from "@/lib/normalizers/jira";

describe("provider normalizers", () => {
  it("normalizes Jira issue-day activity without raw payload retention", () => {
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

    expect(
      normalizeJiraIssueDay(
        issue,
        {
          activityTypes: ["comment", "worklog", "changelog"],
          commentCount: 2,
          worklogCount: 2,
          durationMinutes: 75,
          changedFields: ["status", "assignee"],
          statusTransitions: [{ from: "To Do", to: "In Progress" }],
          firstActivityAt: new Date("2026-05-13T13:00:00.000Z"),
          lastActivityAt: new Date("2026-05-13T16:00:00.000Z")
        },
        "https://generis.atlassian.net"
      )
    ).toMatchObject({
      source: "JIRA",
      sourceId: "issue:10001",
      sourceContainerId: "GEN-42",
      title: "GEN-42: Finish daily report app",
      description: "Commented 2 times, Logged 1h 15m, Changed status, Updated assignee",
      sourceUrl: "https://generis.atlassian.net/browse/GEN-42",
      durationMinutes: 75,
      metadata: {
        kind: "issue-day",
        key: "GEN-42",
        issueId: "10001",
        activityTypes: ["comment", "worklog", "changelog"],
        commentCount: 2,
        worklogCount: 2,
        changedFields: ["status", "assignee"],
        statusTransitions: [{ from: "To Do", to: "In Progress" }]
      }
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

    expect(
      normalizeGoogleTask(
        {
          id: "chat-task-1",
          title: "Follow up from space",
          status: "completed",
          hidden: true,
          completed: "2026-05-13T18:30:00.000Z",
          assignmentInfo: {
            surfaceType: "SPACE",
            linkToTask: "https://chat.google.com/space/task",
            spaceInfo: { space: "spaces/AAAA" }
          }
        },
        "assigned",
        "Assigned to me"
      )
    ).toMatchObject({
      source: "GOOGLE_TASKS",
      sourceId: "chat-task-1",
      sourceUrl: "https://chat.google.com/space/task",
      metadata: {
        taskListTitle: "Assigned to me",
        hidden: true,
        assignmentSurface: "SPACE",
        assignmentSpace: "spaces/AAAA"
      }
    });
  });
});
