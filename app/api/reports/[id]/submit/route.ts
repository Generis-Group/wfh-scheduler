import { assertCanMutateReport, requireSession } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
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

    const submitted = await submitReport(report.id, session.user.id);

    return json({ report: submitted });
  } catch (error) {
    return handleRouteError(error);
  }
}
