import { assertCanAdminManageReport, requireSession } from "@/lib/access";
import {
  revalidateAdminRoutes,
  revalidateReportRoutes,
} from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { withServerTiming } from "@/lib/performance";
import {
  getReportById,
  reopenSubmittedReport,
} from "@/lib/services/reports";

type Context = {
  params: {
    id: string;
  };
};

export async function POST(_request: Request, { params }: Context) {
  try {
    const session = await requireSession();
    const report = await getReportById(params.id);
    assertCanAdminManageReport(session);

    const reopened = await withServerTiming(
      "api:reports:reopen-submitted",
      () => reopenSubmittedReport(report.id, session.user.id),
      { reportId: report.id },
    );
    revalidateReportRoutes();
    revalidateAdminRoutes();

    return json({ report: reopened });
  } catch (error) {
    return handleRouteError(error);
  }
}
