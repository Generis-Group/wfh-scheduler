import { redirect } from "next/navigation";

import { AdminUsers } from "@/components/admin/admin-users";
import { auth } from "@/lib/auth";
import { withServerTiming } from "@/lib/performance";
import { prisma } from "@/lib/prisma";
import { hasUserRole } from "@/lib/roles";
import { serialize } from "@/lib/serializers";
import { adminUserSelect } from "@/lib/services/admin";
import { listDepartments } from "@/lib/services/departments";

export default async function AdminPage() {
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

  if (!hasUserRole(session.user, "ADMIN")) {
    redirect("/");
  }

  const [users, departments] = await withServerTiming("page:admin:data", () =>
    Promise.all([
      prisma.user.findMany({
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: adminUserSelect,
      }),
      listDepartments(),
    ]),
  );

  return (
    <AdminUsers
      initialUsers={serialize(users)}
      initialDepartments={serialize(departments)}
    />
  );
}
