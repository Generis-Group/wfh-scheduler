import { z } from "zod";

import { requireSession } from "@/lib/access";
import { revalidateReportRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, HttpError, json } from "@/lib/http";
import { hasUserRole } from "@/lib/roles";
import { addGoogleTaskReference } from "@/lib/services/sync";
import { dateStringSchema } from "@/lib/validation";

const addGoogleTaskSchema = z.object({
  date: dateStringSchema,
  taskId: z.string().min(1),
  taskListId: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const session = await requireSession();

    if (!hasUserRole(session.user, "EMPLOYEE")) {
      throw new HttpError(403, "Only employees can add Google Tasks to reports.");
    }

    const input = addGoogleTaskSchema.parse(await request.json());
    const report = await addGoogleTaskReference(session.user.id, input.date, input.taskListId, input.taskId);
    revalidateReportRoutes();

    return json({ report });
  } catch (error) {
    return handleRouteError(error);
  }
}
