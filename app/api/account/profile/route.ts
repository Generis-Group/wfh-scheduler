import { requireSession } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { updateOwnProfile } from "@/lib/services/admin";
import { accountProfileSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const input = accountProfileSchema.parse(await request.json());
    const user = await updateOwnProfile(session.user.id, input);

    return json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        timezone: user.timezone,
        mustChangePassword: user.mustChangePassword
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
