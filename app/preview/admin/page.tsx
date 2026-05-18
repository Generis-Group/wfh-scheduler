import { ReviewerDashboard } from "@/components/reports/reviewer-dashboard";
import { todayDateString } from "@/lib/dates";
import { requirePreviewBypass } from "@/lib/preview";

function isoWithHour(date: string, hour: number) {
  return `${date}T${String(hour).padStart(2, "0")}:15:00.000Z`;
}

export default function PreviewAdminPage({
  searchParams
}: {
  searchParams?: {
    date?: string;
  };
}) {
  requirePreviewBypass();

  const date = searchParams?.date ?? todayDateString();
  const nextDay = new Date(`${date}T00:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const nextDate = nextDay.toISOString().slice(0, 10);
  const rows = [
    {
      user: { id: "employee-1", name: "Employee One", email: "employee.one@generisgp.com", role: "EMPLOYEE", status: "ACTIVE" },
      report: {
        id: "report-1",
        reportDate: date,
        status: "SUBMITTED" as const,
        workLocation: "HYBRID",
        summary: "No summary has been entered in this preview report.",
        blockers: "",
        submittedAt: isoWithHour(date, 18),
        updatedAt: isoWithHour(date, 18),
        activities: [
          { id: "activity-1", title: "Imported Jira activity", source: "JIRA", selected: true },
          { id: "activity-2", title: "Imported calendar activity", source: "GOOGLE_CALENDAR", selected: true }
        ],
        comments: [],
        revisions: []
      }
    },
    {
      user: { id: "employee-2", name: "Employee Two", email: "employee.two@generisgp.com", role: "EMPLOYEE", status: "ACTIVE" },
      report: {
        id: "report-2",
        reportDate: date,
        status: "SUBMITTED" as const,
        workLocation: "WFH",
        summary: "",
        blockers: "A blocker note would appear here when an employee reports one.",
        submittedAt: isoWithHour(date, 22),
        updatedAt: `${nextDate}T12:15:00.000Z`,
        activities: [
          { id: "activity-3", title: "Imported task activity", source: "GOOGLE_TASKS", selected: true },
          { id: "activity-4", title: "Manual activity", source: "MANUAL", selected: true }
        ],
        comments: [],
        revisions: [
          {
            id: "revision-1",
            createdAt: `${nextDate}T12:15:00.000Z`,
            editedBy: { name: "Admin Preview" }
          }
        ]
      }
    },
    {
      user: { id: "employee-3", name: "Employee Three", email: "employee.three@generisgp.com", role: "EMPLOYEE", status: "ACTIVE" },
      report: null
    }
  ];

  return (
    <ReviewerDashboard
      isPreview
      rows={rows}
      metrics={{
        users: rows.length,
        submitted: rows.filter((row) => row.report?.status === "SUBMITTED").length,
        blockers: rows.filter((row) => row.report?.blockers).length,
        blockerTrend: [
          { date, count: rows.filter((row) => row.report?.blockers).length }
        ],
        sourceMix: [
          { source: "JIRA", count: 1 },
          { source: "GOOGLE_CALENDAR", count: 1 },
          { source: "GOOGLE_TASKS", count: 1 },
          { source: "MANUAL", count: 1 }
        ]
      }}
      date={date}
      userName="Admin Preview"
      userEmail="admin.preview@generisgp.com"
      userRole="Reviewer"
      userStatus="Preview"
      timezone="America/Toronto"
      reviewerId="preview-admin"
    />
  );
}
