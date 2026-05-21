import { requireRole } from "@/lib/access";
import { revalidateAdminRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { resetAppUserPassword } from "@/lib/services/admin";
import { resetPasswordSchema } from "@/lib/validation";

type Context = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: Context) {
  try {
    await requireRole(["ADMIN"]);
    const input = resetPasswordSchema.parse(await request.json().catch(() => ({})));
    const result = await resetAppUserPassword(params.id, input);
    revalidateAdminRoutes();

    return json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
