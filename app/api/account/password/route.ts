import { requireSession } from "@/lib/access";
import { revalidatePaths } from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { changeOwnPassword } from "@/lib/services/admin";
import { changePasswordSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  try {
    const session = await requireSession({ allowPasswordChangeRequired: true });
    const input = changePasswordSchema.parse(await request.json());
    await changeOwnPassword(session.user.id, input);
    revalidatePaths(["/", "/reports", "/review", "/settings", "/account"]);

    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
