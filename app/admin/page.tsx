import { redirect } from "next/navigation";

import { AdminUsers } from "@/components/admin/admin-users";
import { ReferenceAppShell } from "@/components/reports/reference-shell";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  const [users, departments, setting] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
      select: adminUserSelect
    }),
    listDepartments(),
    prisma.appSetting.findUnique({ where: { key: "company" } })
  ]);
  const rawSettings = setting?.value as
    | {
        jiraProjectKeys?: unknown;
      }
    | undefined;
  const initialSettings = {
    jiraProjectKeys: Array.isArray(rawSettings?.jiraProjectKeys) ? (rawSettings.jiraProjectKeys as string[]) : []
  };

  return (
    <ReferenceAppShell
      active="employees"
      variant="admin"
      userName={session.user.name ?? session.user.email}
      userEmail={session.user.email}
      userRole="Admin"
      userStatus={session.user.status}
      timezone={session.user.timezone}
      mustChangePassword={session.user.mustChangePassword}
    >
      <AdminUsers
        initialUsers={serialize(users)}
        initialDepartments={serialize(departments)}
        initialSettings={serialize(initialSettings)}
      />
    </ReferenceAppShell>
  );
}
