import { ReportHistory } from "@/components/reports/report-history";
import { requirePreviewBypass } from "@/lib/preview";

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export default function PreviewReportsPage() {
  requirePreviewBypass();

  const reports = [
    {
      id: "preview-history-1",
      reportDate: daysAgo(0),
      status: "SUBMITTED" as const,
      workLocation: "HYBRID",
      summary: "Summarized customer follow-up, internal planning, and delivery updates.",
      blockers: "",
      submittedAt: `${daysAgo(0)}T20:30:00.000Z`,
      updatedAt: `${daysAgo(0)}T20:30:00.000Z`,
      activities: [
        {
          id: "preview-history-activity-1",
          source: "JIRA",
          title: "Product workflow review",
          status: "Done",
          durationMinutes: 60,
          employeeNote: "Reviewed acceptance details and resolved follow-up notes.",
          sourceUrl: "#"
        },
        {
          id: "preview-history-activity-2",
          source: "GOOGLE_CALENDAR",
          title: "Client planning meeting",
          status: "Accepted",
          durationMinutes: 30,
          employeeNote: null,
          sourceUrl: "#"
        }
      ],
      comments: [
        {
          id: "preview-history-comment-1",
          body: "Clear update. Please keep the blocker notes current if anything changes.",
          createdAt: `${daysAgo(0)}T21:00:00.000Z`,
          author: { name: "Reviewer Preview" }
        }
      ],
      revisions: []
    },
    {
      id: "preview-history-2",
      reportDate: daysAgo(1),
      status: "DRAFT" as const,
      workLocation: "WFH",
      summary: "",
      blockers: "Waiting on a confirmation before closing one item.",
      submittedAt: null,
      updatedAt: `${daysAgo(1)}T19:15:00.000Z`,
      activities: [
        {
          id: "preview-history-activity-3",
          source: "MANUAL",
          title: "Internal follow-up",
          status: "Manual",
          durationMinutes: null,
          employeeNote: "Draft activity note.",
          sourceUrl: null
        }
      ],
      comments: [],
      revisions: []
    },
    {
      id: "preview-history-3",
      reportDate: daysAgo(2),
      status: "SUBMITTED" as const,
      workLocation: "OFFICE",
      summary: "Submitted a short update and adjusted it later after additional context arrived.",
      blockers: "",
      submittedAt: `${daysAgo(2)}T21:00:00.000Z`,
      updatedAt: `${daysAgo(1)}T14:00:00.000Z`,
      activities: [
        {
          id: "preview-history-activity-4",
          source: "GOOGLE_TASKS",
          title: "Action item cleanup",
          status: "Completed",
          durationMinutes: 20,
          employeeNote: null,
          sourceUrl: "#"
        }
      ],
      comments: [],
      revisions: [
        {
          id: "preview-history-revision-1",
          createdAt: `${daysAgo(1)}T14:00:00.000Z`,
          editedBy: { name: "Preview User" }
        }
      ]
    }
  ];

  return (
    <ReportHistory
      reports={reports}
      userName="Employee Preview"
      userEmail="employee.preview@generisgp.com"
      userRole="Employee"
      userStatus="Preview"
      timezone="America/Toronto"
      isPreview
    />
  );
}
