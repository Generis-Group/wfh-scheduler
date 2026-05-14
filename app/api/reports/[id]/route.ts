import { assertCanAccessReport, requireSession } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { getReportById, updateReport } from "@/lib/services/reports";
import { updateReportSchema } from "@/lib/validation";

type Context = {
  params: {
    id: string;
  };
};

export async function PUT(request: Request, { params }: Context) {
  try {
    const session = await requireSession();
    const report = await getReportById(params.id);
    assertCanAccessReport(session, report);

    const input = updateReportSchema.parse(await request.json());
    const updated = await updateReport(report.id, session.user.id, input);

    return json({ report: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
