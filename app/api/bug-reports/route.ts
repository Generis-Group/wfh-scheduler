import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { withServerTiming } from "@/lib/performance";
import { serialize } from "@/lib/serializers";
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

    return json({ bugReport: serialize(bugReport) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
