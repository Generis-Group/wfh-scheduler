import { assertCanReviewReport, requireRole } from "@/lib/access";
import { revalidateReportRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { getReportById, setReportReadState } from "@/lib/services/reports";
import { reportReadStateSchema } from "@/lib/validation";

type Context = {
  params: {
    id: string;
  };
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const session = await requireRole(["REVIEWER", "ADMIN"]);
    const input = reportReadStateSchema.parse(await request.json());
    const existingReport = await getReportById(params.id);
    await assertCanReviewReport(session, existingReport);
    const report = await setReportReadState(params.id, session.user.id, input.read);
    revalidateReportRoutes();

    return json({ report });
  } catch (error) {
    return handleRouteError(error);
  }
}
