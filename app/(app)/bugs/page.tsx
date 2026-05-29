import { redirect } from "next/navigation";

import { BugReportPage } from "@/components/bugs/bug-report-page";
import { auth } from "@/lib/auth";
import { withServerTiming } from "@/lib/performance";
import { serialize } from "@/lib/serializers";
import {
  canReviewBugReports,
  listVisibleBugReports,
} from "@/lib/services/bug-reports";

type BugsPageProps = {
  searchParams?: {
    from?: string | string[];
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
  const bugReports = await withServerTiming("page:bug-reports:data", () =>
    listVisibleBugReports({
      userId: session.user.id,
      canReviewAll,
    }),
  );

  return (
    <BugReportPage
      initialReports={serialize(bugReports)}
      canReviewAll={canReviewAll}
      currentUserName={session.user.name ?? session.user.email ?? "You"}
      sourcePagePath={normalizeSourcePagePath(searchParams?.from)}
    />
  );
}
