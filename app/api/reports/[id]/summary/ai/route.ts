import { assertCanMutateReport, requireSession } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { withServerTiming } from "@/lib/performance";
import { generateDailyReportSummaryWithAI } from "@/lib/services/ai-summary";
import { getReportById } from "@/lib/services/reports";

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

    const summary = await withServerTiming(
      "api:reports:ai-summary",
      () => generateDailyReportSummaryWithAI(session.user.id, report),
      { reportId: report.id },
    );

    return json(summary);
  } catch (error) {
    return handleRouteError(error);
  }
}
