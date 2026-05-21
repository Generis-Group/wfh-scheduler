import { redirect } from "next/navigation";

import { AdminUsers } from "@/components/admin/admin-users";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serializers";
import { adminUserSelect } from "@/lib/services/admin";
import { getCompanySettings } from "@/lib/services/company-settings";
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

  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  const [users, departments, initialSettings] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
      select: adminUserSelect,
    }),
    listDepartments(),
    getCompanySettings(),
  ]);

  return (
    <AdminUsers
      initialUsers={serialize(users)}
      initialDepartments={serialize(departments)}
      initialSettings={serialize(initialSettings)}
    />
  );
}
