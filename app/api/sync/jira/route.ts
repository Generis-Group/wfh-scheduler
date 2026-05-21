import { requireSession } from "@/lib/access";
import { revalidateReportRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { syncJira } from "@/lib/services/sync";
import { syncSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const input = syncSchema.parse(await request.json());
    const result = await syncJira(session.user.id, input.date, session.user.timezone);
    revalidateReportRoutes();

    return json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
