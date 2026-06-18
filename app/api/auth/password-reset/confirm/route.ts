import { handleRouteError, json } from "@/lib/http";
import { resetPasswordWithToken } from "@/lib/services/account-auth";
import { passwordResetConfirmSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const input = passwordResetConfirmSchema.parse(await request.json());
    await resetPasswordWithToken(input);

    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
