import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { withServerTiming } from "@/lib/performance";
import { serialize } from "@/lib/serializers";
import { sendBugReportAdminEmail } from "@/lib/services/bug-report-emails";
import { createBugReport } from "@/lib/services/bug-reports";
import { createBugReportSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const input = createBugReportSchema.parse(await request.json());
    const bugReport = await withServerTiming(
      "api:bug-reports:create",
      () => createBugReport(session.user.id, input),
      { attachmentCount: input.attachments.length },
    );

    revalidatePath("/bugs");

    const adminEmailDelivery = await withServerTiming(
      "api:bug-reports:notify-admins",
      () => sendBugReportAdminEmail(bugReport),
      { reportId: bugReport.id },
    ).catch((error) => {
      console.error("Failed to notify admins about bug report.", error);

      return {
        status: "FAILED" as const,
        error:
          error instanceof Error
            ? error.message
            : "Unknown bug report email error.",
      };
    });

    return json(
      { bugReport: serialize(bugReport), adminEmailDelivery },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
