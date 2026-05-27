import { z } from "zod";

import { requireSession } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { searchIncompleteGoogleTasks } from "@/lib/services/sync";

const searchSchema = z.object({
  q: z.string().trim().min(2).max(120)
});

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const input = searchSchema.parse({
      q: url.searchParams.get("q") ?? ""
    });
    const tasks = await searchIncompleteGoogleTasks(session.user.id, input.q);

    return json({ tasks });
  } catch (error) {
    return handleRouteError(error);
  }
}
