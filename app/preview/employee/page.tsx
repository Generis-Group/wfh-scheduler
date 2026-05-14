import { DailyReportApp } from "@/components/reports/daily-report-app";
import { todayDateString } from "@/lib/dates";

export default function PreviewEmployeePage({
  searchParams
}: {
  searchParams?: {
    date?: string;
  };
}) {
  const date = searchParams?.date ?? todayDateString();
  const now = new Date();

  return (
    <DailyReportApp
      isPreview
      date={date}
      userName="Employee Preview"
      userRole="Employee"
      history={[
        { id: "history-current", reportDate: date, status: "SUBMITTED" },
        { id: "history-prior-1", reportDate: new Date(now.getTime() - 86_400_000).toISOString(), status: "SUBMITTED" },
        { id: "history-prior-2", reportDate: new Date(now.getTime() - 172_800_000).toISOString(), status: "SUBMITTED", editedAfterDate: true }
      ]}
      initialReport={{
        id: "preview-employee-report",
        reportDate: date,
        workLocation: "HYBRID",
        summary: "",
        blockers: "",
        status: "DRAFT",
        submittedAt: null,
        updatedAt: null,
        activities: [
          {
            id: "preview-activity-1",
            source: "JIRA",
            title: "Project planning update",
            description: "Imported issue activity will appear here once Jira is connected.",
            status: "In Progress",
            sourceUrl: "#",
            durationMinutes: 75,
            selected: true,
            employeeNote: ""
          },
          {
            id: "preview-activity-2",
            source: "GOOGLE_CALENDAR",
            title: "Client coordination meeting",
            description: "Calendar meetings will be available as report activities.",
            status: "Completed",
            sourceUrl: "#",
            durationMinutes: 45,
            selected: true,
            employeeNote: ""
          },
          {
            id: "preview-activity-3",
            source: "GOOGLE_TASKS",
            title: "Follow-up task",
            description: "Selected task lists can populate daily work items.",
            status: "To Do",
            sourceUrl: "#",
            durationMinutes: 20,
            selected: false,
            employeeNote: ""
          }
        ]
      }}
    />
  );
}
