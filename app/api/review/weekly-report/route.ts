import { requireRole } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { normalizeUserRoles } from "@/lib/roles";
import { getWeeklyReportForEmployee } from "@/lib/services/reports";
import { weeklyReportQuerySchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const session = await requireRole(["REVIEWER", "ADMIN"]);
    const query = weeklyReportQuerySchema.parse(await request.json());
    const weeklyReport = await getWeeklyReportForEmployee(
      query.userId,
      query.date,
      { userId: session.user.id, roles: normalizeUserRoles(session.user) },
    );

    return json({ weeklyReport });
  } catch (error) {
    return handleRouteError(error);
  }
}
