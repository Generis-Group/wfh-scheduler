import { redirect } from "next/navigation";

import { EmptyReferencePage } from "@/components/reports/empty-reference-page";
import { auth } from "@/lib/auth";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const isReviewer = session.user.role === "COO" || session.user.role === "ADMIN";

  return (
    <EmptyReferencePage
      active="settings"
      variant={isReviewer ? "admin" : "employee"}
      title="Settings"
      description="Profile, notification, and integration settings will appear here once account setup is connected."
      userName={session.user.name ?? session.user.email}
      userRole={session.user.role === "ADMIN" ? "Admin" : isReviewer ? "Reviewer" : "Employee"}
    />
  );
}
