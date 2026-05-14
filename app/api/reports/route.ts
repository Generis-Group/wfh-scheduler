import { assertCanAccessUser, requireSession } from "@/lib/access";
import { getDashboardMetrics, getDailyReport, listReportsForDate } from "@/lib/services/reports";
import { handleRouteError, json } from "@/lib/http";
import { reportQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const query = reportQuerySchema.parse({
      date: url.searchParams.get("date"),
      userId: url.searchParams.get("userId") ?? undefined
    });

    if (!query.userId && (session.user.role === "COO" || session.user.role === "ADMIN")) {
      const [reports, metrics] = await Promise.all([
        listReportsForDate(query.date),
        getDashboardMetrics(query.date)
      ]);

      return json({ reports, metrics });
    }

    const userId = query.userId ?? session.user.id;
    assertCanAccessUser(session, userId);

    const report = await getDailyReport(userId, query.date);

    return json({ report });
  } catch (error) {
    return handleRouteError(error);
  }
}
