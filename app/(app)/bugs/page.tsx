import { redirect } from "next/navigation";

import { BugReportPage } from "@/components/bugs/bug-report-page";
import { auth } from "@/lib/auth";
import { withServerTiming } from "@/lib/performance";
import { serialize } from "@/lib/serializers";
import {
  canReviewBugReports,
  getVisibleBugReport,
  listVisibleBugReports,
} from "@/lib/services/bug-reports";

type BugsPageProps = {
  searchParams?: {
    from?: string | string[];
    reportId?: string | string[];
  };
};

function normalizeSourcePagePath(value?: string | string[]) {
  const source = Array.isArray(value) ? value[0] : value;

  if (!source || !source.startsWith("/") || source.startsWith("//")) {
    return null;
  }

  if (source.startsWith("/bugs")) {
    return null;
  }

  return source.slice(0, 500);
}

function normalizeReportId(value?: string | string[]) {
  const reportId = Array.isArray(value) ? value[0] : value;

  if (!reportId || reportId.length > 128) {
    return null;
  }

  return reportId;
}

export default async function BugsPage({ searchParams }: BugsPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.status === "DISABLED") {
    redirect("/api/auth/signout?callbackUrl=/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  const canReviewAll = canReviewBugReports(session.user);
  const targetReportId = normalizeReportId(searchParams?.reportId);
  const [openBugReports, solvedBugReports, targetBugReport] = await withServerTiming(
    "page:bug-reports:data",
    () =>
      Promise.all([
        listVisibleBugReports({
          userId: session.user.id,
          canReviewAll,
          status: "OPEN",
        }),
        listVisibleBugReports({
          userId: session.user.id,
          canReviewAll,
          status: "SOLVED",
        }),
        targetReportId
          ? getVisibleBugReport(targetReportId, {
              userId: session.user.id,
              canReviewAll,
            })
          : Promise.resolve(null),
      ]),
  );
  return (
    <BugReportPage
      initialOpenReports={serialize(openBugReports.reports)}
      initialSolvedReports={serialize(solvedBugReports.reports)}
      initialOpenTotalCount={openBugReports.totalCount}
      initialSolvedTotalCount={solvedBugReports.totalCount}
      initialSelectedReport={serialize(targetBugReport)}
      canReviewAll={canReviewAll}
      currentUserName={session.user.name ?? session.user.email ?? "You"}
      sourcePagePath={normalizeSourcePagePath(searchParams?.from)}
      initialSelectedReportId={targetReportId}
    />
  );
}
