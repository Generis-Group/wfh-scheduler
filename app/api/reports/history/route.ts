import { requireSession } from "@/lib/access";
import { isValidReportDateString } from "@/lib/dates";
import { handleRouteError, HttpError, json } from "@/lib/http";
import { normalizedPage, normalizedPageSize } from "@/lib/pagination";
import { withServerTiming } from "@/lib/performance";
import { hasUserRole } from "@/lib/roles";
import { serialize } from "@/lib/serializers";
import { listReportHistory } from "@/lib/services/reports";

function dateParam(value: string | null) {
  return isValidReportDateString(value) ? value : null;
}

function statusFilter(value: string | null) {
  return value === "DRAFT" || value === "SUBMITTED" ? value : "ALL";
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();

    if (!hasUserRole(session.user, "EMPLOYEE")) {
      throw new HttpError(403, "Only employees can view report history.");
    }

    const url = new URL(request.url);
    const page = await withServerTiming(
      "api:reports:history",
      () =>
        listReportHistory(session.user.id, {
          limit: normalizedPageSize(url.searchParams.get("limit")),
          page: normalizedPage(url.searchParams.get("page")),
          search: url.searchParams.get("search"),
          status: statusFilter(url.searchParams.get("status")),
          fromDate: dateParam(url.searchParams.get("fromDate")),
          toDate: dateParam(url.searchParams.get("toDate")),
        }),
      {
        page: normalizedPage(url.searchParams.get("page")),
        status: statusFilter(url.searchParams.get("status")),
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
