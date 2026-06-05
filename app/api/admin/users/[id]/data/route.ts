import { requireRole } from "@/lib/access";
import { revalidateAdminRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { withServerTiming } from "@/lib/performance";
import { deleteAppUserReportData } from "@/lib/services/admin";

type Context = {
  params: {
    id: string;
  };
};

export async function DELETE(_request: Request, { params }: Context) {
  try {
    await requireRole(["ADMIN"]);
    const deleted = await withServerTiming(
      "api:admin:delete-user-report-data",
      () => deleteAppUserReportData(params.id),
      { userId: params.id },
    );
    revalidateAdminRoutes();

    return json({ deleted });
  } catch (error) {
    return handleRouteError(error);
  }
}
