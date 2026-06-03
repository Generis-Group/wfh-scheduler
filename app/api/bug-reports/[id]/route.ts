import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/access";
import { handleRouteError, HttpError, json } from "@/lib/http";
import { withServerTiming } from "@/lib/performance";
import { serialize } from "@/lib/serializers";
import {
  canReviewBugReports,
  deleteBugReport,
  getVisibleBugReport,
  updateBugReportStatus,
} from "@/lib/services/bug-reports";
import { updateBugReportStatusSchema } from "@/lib/validation";

type Context = {
  params: {
    id: string;
  };
};

export async function GET(_request: Request, { params }: Context) {
  try {
    const session = await requireSession();
    const bugReport = await withServerTiming(
      "api:bug-reports:detail",
      () =>
        getVisibleBugReport(params.id, {
          userId: session.user.id,
          canReviewAll: canReviewBugReports(session.user),
        }),
      { reportId: params.id },
    );

    if (!bugReport) {
      throw new HttpError(404, "Bug report not found.");
    }

    return json({ bugReport: serialize(bugReport) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const session = await requireSession();

    if (!canReviewBugReports(session.user)) {
      throw new HttpError(403, "Only admins can update bug reports.");
    }

    const input = updateBugReportStatusSchema.parse(await request.json());
    const bugReport = await withServerTiming(
      "api:bug-reports:update-status",
      () => updateBugReportStatus(params.id, session.user.id, input),
      { reportId: params.id, status: input.status },
    );

    revalidatePath("/bugs");

    return json({ bugReport: serialize(bugReport) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const session = await requireSession();

    if (!canReviewBugReports(session.user)) {
      throw new HttpError(403, "Only admins can delete bug reports.");
    }

    await withServerTiming(
      "api:bug-reports:delete",
      () => deleteBugReport(params.id),
      { reportId: params.id },
    );

    revalidatePath("/bugs");

    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
