import { assertCanAccessUserData, requireSession } from "@/lib/access";
import { revalidateReportRoutes } from "@/lib/cache-invalidation";
import {
  ensureDailyReport,
  getDailyReport,
  getReviewDashboardData,
  updateReport,
} from "@/lib/services/reports";
import { handleRouteError, HttpError, json } from "@/lib/http";
import { withServerTiming } from "@/lib/performance";
import { hasUserRole, normalizeUserRoles } from "@/lib/roles";
import { createReportSchema, reportQuerySchema } from "@/lib/validation";

function isAutosaveRequest(request: Request) {
  return request.headers.get("x-generis-autosave") === "1";
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const query = reportQuerySchema.parse({
      date: url.searchParams.get("date"),
      userId: url.searchParams.get("userId") ?? undefined,
    });

    if (
      !query.userId &&
      (hasUserRole(session.user, "REVIEWER") ||
        hasUserRole(session.user, "ADMIN"))
    ) {
      const scope = {
        userId: session.user.id,
        roles: normalizeUserRoles(session.user),
      };
      const { rows: reports, metrics } = await withServerTiming(
        "api:reports:review-dashboard",
        () => getReviewDashboardData(query.date, scope),
        { date: query.date },
      );

      return json({ reports, metrics });
    }

    const userId = query.userId ?? session.user.id;
    await assertCanAccessUserData(session, userId);

    const report = await withServerTiming(
      "api:reports:get",
      () => getDailyReport(userId, query.date),
      { date: query.date },
    );

    return json({ report });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();

    if (!hasUserRole(session.user, "EMPLOYEE")) {
      throw new HttpError(403, "Only employees can create daily reports.");
    }

    const input = createReportSchema.parse(await request.json());
    const updated = await withServerTiming(
      "api:reports:save",
      async () => {
        const report = await ensureDailyReport(session.user.id, input.date);
        return updateReport(report.id, session.user.id, input);
      },
      { date: input.date, autosave: isAutosaveRequest(request) },
    );
    if (!isAutosaveRequest(request)) {
      revalidateReportRoutes();
    }

    return json({ report: updated }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
