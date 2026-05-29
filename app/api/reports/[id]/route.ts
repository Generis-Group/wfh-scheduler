import { assertCanMutateReport, requireSession } from "@/lib/access";
import { revalidateReportRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { withServerTiming } from "@/lib/performance";
import {
  deleteDraftReport,
  getReportById,
  updateReport,
} from "@/lib/services/reports";
import { updateReportSchema } from "@/lib/validation";

type Context = {
  params: {
    id: string;
  };
};

function isAutosaveRequest(request: Request) {
  return request.headers.get("x-generis-autosave") === "1";
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const session = await requireSession();
    const report = await getReportById(params.id);
    assertCanMutateReport(session, report);

    const input = updateReportSchema.parse(await request.json());
    const updated = await withServerTiming(
      "api:reports:update",
      () => updateReport(report.id, session.user.id, input),
      { reportId: report.id, autosave: isAutosaveRequest(request) },
    );
    if (!isAutosaveRequest(request)) {
      revalidateReportRoutes();
    }

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

    await withServerTiming(
      "api:reports:delete-draft",
      () => deleteDraftReport(report.id),
      { reportId: report.id },
    );
    revalidateReportRoutes();

    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
