import { assertCanAccessUserData, requireSession } from "@/lib/access";
import { ensureDailyReport, getDashboardMetrics, getDailyReport, listReportsForDate, updateReport } from "@/lib/services/reports";
import { handleRouteError, HttpError, json } from "@/lib/http";
import { createReportSchema, reportQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const query = reportQuerySchema.parse({
      date: url.searchParams.get("date"),
      userId: url.searchParams.get("userId") ?? undefined
    });

    if (!query.userId && (session.user.role === "REVIEWER" || session.user.role === "ADMIN")) {
      const scope = { userId: session.user.id, role: session.user.role };
      const [reports, metrics] = await Promise.all([
        listReportsForDate(query.date, scope),
        getDashboardMetrics(query.date, scope)
      ]);

      return json({ reports, metrics });
    }

    const userId = query.userId ?? session.user.id;
    await assertCanAccessUserData(session, userId);

    const report = await getDailyReport(userId, query.date);

    return json({ report });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();

    if (session.user.role !== "EMPLOYEE") {
      throw new HttpError(403, "Only employees can create daily reports.");
    }

    const input = createReportSchema.parse(await request.json());
    const report = await ensureDailyReport(session.user.id, input.date);
    const updated = await updateReport(report.id, session.user.id, input);

    return json({ report: updated }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
