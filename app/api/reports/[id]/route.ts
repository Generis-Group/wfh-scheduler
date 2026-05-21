import { assertCanMutateReport, requireSession } from "@/lib/access";
import { revalidateReportRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { deleteDraftReport, getReportById, updateReport } from "@/lib/services/reports";
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
    assertCanMutateReport(session, report);

    const input = updateReportSchema.parse(await request.json());
    const updated = await updateReport(report.id, session.user.id, input);
    revalidateReportRoutes();

    return json({ report: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const session = await requireSession();
    const report = await getReportById(params.id);
    assertCanMutateReport(session, report);

    await deleteDraftReport(report.id);
    revalidateReportRoutes();

    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
