import { requireRole } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { adminUserInclude, createAppUser } from "@/lib/services/admin";
import { createUserSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireRole(["ADMIN"]);

    const users = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
      include: adminUserInclude
    });

    return json({ users });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const input = createUserSchema.parse(await request.json());
    const result = await createAppUser(input);

    return json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
