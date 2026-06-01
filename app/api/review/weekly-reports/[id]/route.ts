import { requireRole } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { normalizeUserRoles } from "@/lib/roles";
import { getSavedWeeklyReport } from "@/lib/services/reports";
import { weeklyReportIdSchema } from "@/lib/validation";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await requireRole(["REVIEWER"]);
    const { id } = weeklyReportIdSchema.parse(params);
    const weeklyReport = await getSavedWeeklyReport(id, {
      userId: session.user.id,
      roles: normalizeUserRoles(session.user),
    });

    return json({ weeklyReport });
  } catch (error) {
    return handleRouteError(error);
  }
}
