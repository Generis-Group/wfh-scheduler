import { handleRouteError, json } from "@/lib/http";
import { requestPasswordReset } from "@/lib/services/account-auth";
import { passwordResetRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const input = passwordResetRequestSchema.parse(await request.json());
    await requestPasswordReset(input);

    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
