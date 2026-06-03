import { requireRole } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { normalizeUserRoles } from "@/lib/roles";
import { listSavedWeeklyReportsForEmployee } from "@/lib/services/reports";
import { weeklyReportListQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const session = await requireRole(["REVIEWER", "ADMIN"]);
    const url = new URL(request.url);
    const query = weeklyReportListQuerySchema.parse({
      userId: url.searchParams.get("userId"),
    });
    const weeklyReports = await listSavedWeeklyReportsForEmployee(
      query.userId,
      { userId: session.user.id, roles: normalizeUserRoles(session.user) },
    );

    return json({ weeklyReports });
  } catch (error) {
    return handleRouteError(error);
  }
}
