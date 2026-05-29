import { requireSession } from "@/lib/access";
import { handleRouteError, HttpError, json } from "@/lib/http";
import { withServerTiming } from "@/lib/performance";
import { serialize } from "@/lib/serializers";
import {
  canReviewBugReports,
  getVisibleBugReport,
} from "@/lib/services/bug-reports";

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
