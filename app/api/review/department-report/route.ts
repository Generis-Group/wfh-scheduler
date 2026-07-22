import { requireRole } from "@/lib/access";
import { handleRouteError, json } from "@/lib/http";
import { normalizeUserRoles } from "@/lib/roles";
import { generateDepartmentReportSummaries } from "@/lib/services/department-report-summary";
import { getDepartmentReport } from "@/lib/services/reports";
import { departmentReportQuerySchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const session = await requireRole(["REVIEWER", "ADMIN"]);
    const query = departmentReportQuerySchema.parse(await request.json());
    const departmentReport = await getDepartmentReport(
      query.date,
      query.period,
      { userId: session.user.id, roles: normalizeUserRoles(session.user) },
    );
    const departmentSummaries = await generateDepartmentReportSummaries(
      session.user.id,
      departmentReport,
    );

    return json({
      departmentReport: {
        ...departmentReport,
        departmentSummaries,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
