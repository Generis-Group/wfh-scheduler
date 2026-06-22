import { requireSession } from "@/lib/access";
import { revalidateReportRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, HttpError, json } from "@/lib/http";
import { hasUserRole } from "@/lib/roles";
import { setPlannedWorkLocation } from "@/lib/services/work-location-plans";
import { plannedWorkLocationSchema } from "@/lib/validation";

export async function PUT(request: Request) {
  try {
    const session = await requireSession();

    if (!hasUserRole(session.user, "EMPLOYEE")) {
      throw new HttpError(403, "Only employees can plan work locations.");
    }

    const input = plannedWorkLocationSchema.parse(await request.json());
    const plan = await setPlannedWorkLocation({
      userId: session.user.id,
      dateString: input.date,
      workLocation: input.workLocation,
    });
    revalidateReportRoutes();

    return json({ plan });
  } catch (error) {
    return handleRouteError(error);
  }
}
