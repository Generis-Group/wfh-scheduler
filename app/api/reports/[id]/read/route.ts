import { requireRole } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { setReportReadState } from "@/lib/services/reports";
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
    const report = await setReportReadState(params.id, session.user.id, input.read);

    return json({ report });
  } catch (error) {
    return handleRouteError(error);
  }
}
