import { requireRole } from "@/lib/access";
import { revalidateAdminRoutes } from "@/lib/cache-invalidation";
import { handleRouteError, json } from "@/lib/http";
import { withServerTiming } from "@/lib/performance";
import { prisma } from "@/lib/prisma";
import { adminUserSelect, createAppUser } from "@/lib/services/admin";
import { createUserSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireRole(["ADMIN"]);

    const users = await withServerTiming("api:admin:list-users", () =>
      prisma.user.findMany({
        where: { status: { not: "DISABLED" } },
        orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
        select: adminUserSelect,
      }),
    );

    return json({ users });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const input = createUserSchema.parse(await request.json());
    const result = await withServerTiming("api:admin:create-user", () =>
      createAppUser(input),
    );
    revalidateAdminRoutes();

    return json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
