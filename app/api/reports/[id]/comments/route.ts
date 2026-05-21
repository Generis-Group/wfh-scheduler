import { assertCanAccessReport, requireRole } from "@/lib/access";
import { revalidateReportRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { addReportComment, getReportById } from "@/lib/services/reports";
import { commentSchema } from "@/lib/validation";

type Context = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: Context) {
  try {
    const session = await requireRole(["REVIEWER", "ADMIN"]);
    const input = commentSchema.parse(await request.json());
    const existingReport = await getReportById(params.id);
    await assertCanAccessReport(session, existingReport);
    const report = await addReportComment(params.id, session.user.id, input.body);
    revalidateReportRoutes();

    return json({ report });
  } catch (error) {
    return handleRouteError(error);
  }
}
