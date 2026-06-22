import { redirect } from "next/navigation";

import { WorkLocationCalendar } from "@/components/reports/work-location-calendar";
import { auth } from "@/lib/auth";
import { isValidReportDateString, todayDateString } from "@/lib/dates";
import { withServerTiming } from "@/lib/performance";
import { normalizeUserRoles } from "@/lib/roles";
import { serialize } from "@/lib/serializers";
import { getWorkLocationCalendarData } from "@/lib/services/work-location-plans";

export default async function WorkLocationCalendarPage({
  searchParams,
}: {
  searchParams?: {
    date?: string;
    departmentId?: string;
  };
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.status === "DISABLED") {
    redirect("/api/auth/signout?callbackUrl=/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  const date =
    searchParams?.date && isValidReportDateString(searchParams.date)
      ? searchParams.date
      : todayDateString();
  const data = await withServerTiming(
    "page:work-location-calendar:data",
    () =>
      getWorkLocationCalendarData({
        dateString: date,
        scope: {
          userId: session.user.id,
          roles: normalizeUserRoles(session.user),
        },
        departmentId: searchParams?.departmentId || null,
      }),
    { date },
  );

  return <WorkLocationCalendar data={serialize(data)} />;
}
