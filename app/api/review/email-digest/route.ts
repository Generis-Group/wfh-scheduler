import { requireRole } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { sendReviewDigest } from "@/lib/services/email-digest";
import { reviewDigestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    await requireRole(["REVIEWER", "ADMIN"]);
    const input = reviewDigestSchema.parse(await request.json());
    const result = await sendReviewDigest({
      date: input.date,
      trigger: "MANUAL",
      filters: input.filters
    });

    return json({
      emailRun: result.emailRun,
      skipped: result.skipped
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
