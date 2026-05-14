import { requireSession } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { syncGoogleCalendar } from "@/lib/services/sync";
import { syncSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const input = syncSchema.parse(await request.json());
    const result = await syncGoogleCalendar(session.user.id, input.date, session.user.timezone);

    return json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
