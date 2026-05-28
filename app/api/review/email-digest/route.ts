import { requireRole } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { normalizeUserRoles } from "@/lib/roles";
import { sendReviewDigest } from "@/lib/services/email-digest";
import { reviewDigestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const session = await requireRole(["REVIEWER", "ADMIN"]);
    const input = reviewDigestSchema.parse(await request.json());
    const result = await sendReviewDigest({
      date: input.date,
      trigger: "MANUAL",
      filters: input.filters,
      scope: { userId: session.user.id, roles: normalizeUserRoles(session.user) }
    });

    return json({
      emailRun: result.emailRun,
      skipped: result.skipped
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
