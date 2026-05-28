import { requireRole } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { sendReportReminderEmail } from "@/lib/services/report-reminder-email";
import { reportReminderSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const session = await requireRole(["REVIEWER", "ADMIN"]);
    const input = reportReminderSchema.parse(await request.json());
    const result = await sendReportReminderEmail({
      date: input.date,
      userId: input.userId,
      scope: { userId: session.user.id, role: session.user.role },
    });

    return json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
