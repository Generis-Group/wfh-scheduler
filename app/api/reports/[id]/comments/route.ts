import { assertCanReviewReport, requireRole } from "@/lib/access";
import { revalidateReportRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { sendReportCommentEmail } from "@/lib/services/report-comment-emails";
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
    await assertCanReviewReport(session, existingReport);
    const report = await addReportComment(params.id, session.user.id, input.body);
    const emailDelivery = await sendReportCommentEmail({
      report,
      commentBody: input.body,
      author: {
        name: session.user.name,
        email: session.user.email,
      },
    });
    revalidateReportRoutes();

    return json({ report, emailDelivery });
  } catch (error) {
    return handleRouteError(error);
  }
}
