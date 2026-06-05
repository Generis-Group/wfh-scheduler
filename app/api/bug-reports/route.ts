import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { normalizedPage, normalizedPageSize } from "@/lib/pagination";
import { withServerTiming } from "@/lib/performance";
import { serialize } from "@/lib/serializers";
import { sendBugReportAdminEmail } from "@/lib/services/bug-report-emails";
import {
  canReviewBugReports,
  createBugReport,
  listVisibleBugReports,
} from "@/lib/services/bug-reports";
import { createBugReportSchema } from "@/lib/validation";

function statusFilter(value: string | null) {
  return value === "SOLVED" ? "SOLVED" : "OPEN";
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const page = await withServerTiming(
      "api:bug-reports:list",
      () =>
        listVisibleBugReports({
          userId: session.user.id,
          canReviewAll: canReviewBugReports(session.user),
          status: statusFilter(url.searchParams.get("status")),
          search: url.searchParams.get("search"),
          page: normalizedPage(url.searchParams.get("page")),
          limit: normalizedPageSize(url.searchParams.get("limit")),
        }),
      {
        status: statusFilter(url.searchParams.get("status")),
        page: normalizedPage(url.searchParams.get("page")),
      },
    );

    return json({
      reports: serialize(page.reports),
      page: page.page,
      pageSize: page.pageSize,
      totalCount: page.totalCount,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const input = createBugReportSchema.parse(await request.json());
    const bugReport = await withServerTiming(
      "api:bug-reports:create",
      () => createBugReport(session.user.id, input),
      { attachmentCount: input.attachments.length },
    );

    revalidatePath("/bugs");

    const adminEmailDelivery = await withServerTiming(
      "api:bug-reports:notify-admins",
      () => sendBugReportAdminEmail(bugReport),
      { reportId: bugReport.id },
    ).catch((error) => {
      console.error("Failed to notify admins about bug report.", error);

      return {
        status: "FAILED" as const,
        error:
          error instanceof Error
            ? error.message
            : "Unknown bug report email error.",
      };
    });

    return json(
      { bugReport: serialize(bugReport), adminEmailDelivery },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
