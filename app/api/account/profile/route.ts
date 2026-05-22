import { requireSession } from "@/lib/access";
import { revalidatePaths } from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { updateOwnProfile } from "@/lib/services/admin";
import { accountProfileSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const input = accountProfileSchema.parse(await request.json());
    const user = await updateOwnProfile(session.user.id, input);
    revalidatePaths(["/", "/reports", "/review", "/settings", "/account"]);

    return json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        mustChangePassword: user.mustChangePassword
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
