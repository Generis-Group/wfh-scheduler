import { assertCanAccessUserData, requireSession } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { listActivities } from "@/lib/services/activity";
import { dateStringSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const date = dateStringSchema.parse(url.searchParams.get("date"));
    const userId = url.searchParams.get("userId") ?? session.user.id;

    await assertCanAccessUserData(session, userId);

    const activities = await listActivities(userId, date);

    return json({ activities });
  } catch (error) {
    return handleRouteError(error);
  }
}
