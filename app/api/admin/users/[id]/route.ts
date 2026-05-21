import { requireRole } from "@/lib/access";
import { revalidateAdminRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { updateAppUser } from "@/lib/services/admin";
import { updateUserSchema } from "@/lib/validation";

type Context = {
  params: {
    id: string;
  };
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    await requireRole(["ADMIN"]);
    const input = updateUserSchema.parse(await request.json());
    const user = await updateAppUser(params.id, input);
    revalidateAdminRoutes();

    return json({ user });
  } catch (error) {
    return handleRouteError(error);
  }
}
