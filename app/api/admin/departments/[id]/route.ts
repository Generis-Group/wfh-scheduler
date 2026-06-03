import { requireRole } from "@/lib/access";
import { revalidateAdminRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { withServerTiming } from "@/lib/performance";
import { deleteDepartment } from "@/lib/services/departments";

type Context = {
  params: {
    id: string;
  };
};

export async function DELETE(_request: Request, { params }: Context) {
  try {
    await requireRole(["ADMIN"]);
    await withServerTiming(
      "api:admin:delete-department",
      () => deleteDepartment(params.id),
      { departmentId: params.id },
    );
    revalidateAdminRoutes();

    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
