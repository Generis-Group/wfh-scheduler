import { requireRole } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { createDepartment, listDepartments } from "@/lib/services/departments";
import { createDepartmentSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const departments = await listDepartments();

    return json({ departments });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const input = createDepartmentSchema.parse(await request.json());
    const department = await createDepartment(input.name);

    return json({ department }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
