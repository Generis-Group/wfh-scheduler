import { requireSession } from "@/lib/access";
import { todayDateString } from "@/lib/dates";
import { handleRouteError, json } from "@/lib/http";
import { normalizeUserRoles } from "@/lib/roles";
import { getWorkLocationCalendarData } from "@/lib/services/work-location-plans";
import { workLocationCalendarQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const query = workLocationCalendarQuerySchema.parse({
      date: url.searchParams.get("date") ?? undefined,
      departmentId: url.searchParams.get("departmentId") ?? undefined,
    });
    const date = query.date ?? todayDateString();
    const data = await getWorkLocationCalendarData({
      dateString: date,
      scope: {
        userId: session.user.id,
        roles: normalizeUserRoles(session.user),
      },
      departmentId: query.departmentId,
    });

    return json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
