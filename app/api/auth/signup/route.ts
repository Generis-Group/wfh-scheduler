import { handleRouteError, json } from "@/lib/http";
import { requestSelfServiceSignup } from "@/lib/services/account-auth";
import { signupSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const input = signupSchema.parse(await request.json());
    await requestSelfServiceSignup(input);

    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
