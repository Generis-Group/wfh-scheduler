import { requireRole } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { normalizedPage, normalizedPageSize } from "@/lib/pagination";
import { withServerTiming } from "@/lib/performance";
import { serialize } from "@/lib/serializers";
import { listReportsForAdminManagement } from "@/lib/services/reports";

function statusFilter(value: string | null) {
  return value === "DRAFT" || value === "SUBMITTED" ? value : "ALL";
}

export async function GET(request: Request) {
  try {
    await requireRole(["ADMIN"]);

    const url = new URL(request.url);
    const page = await withServerTiming(
      "api:admin:reports:list",
      () =>
        listReportsForAdminManagement({
          limit: normalizedPageSize(url.searchParams.get("limit")),
          page: normalizedPage(url.searchParams.get("page")),
          search: url.searchParams.get("search"),
          status: statusFilter(url.searchParams.get("status")),
        }),
      {
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
