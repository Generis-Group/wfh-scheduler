import { requireRole } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { addReportComment } from "@/lib/services/reports";
import { commentSchema } from "@/lib/validation";

type Context = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: Context) {
  try {
    const session = await requireRole(["COO", "ADMIN"]);
    const input = commentSchema.parse(await request.json());
    const report = await addReportComment(params.id, session.user.id, input.body);

    return json({ report });
  } catch (error) {
    return handleRouteError(error);
  }
}
