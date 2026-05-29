import { assertCanMutateReport, requireSession } from "@/lib/access";
import { revalidateReportRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { withServerTiming } from "@/lib/performance";
import { getReportById, submitReport } from "@/lib/services/reports";

type Context = {
  params: {
    id: string;
  };
};

export async function POST(_request: Request, { params }: Context) {
  try {
    const session = await requireSession();
    const report = await getReportById(params.id);
    assertCanMutateReport(session, report);

    const submitted = await withServerTiming(
      "api:reports:submit",
      () => submitReport(report.id, session.user.id),
      { reportId: report.id },
    );
    revalidateReportRoutes();

    return json({ report: submitted });
  } catch (error) {
    return handleRouteError(error);
  }
}
