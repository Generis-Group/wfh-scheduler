import { redirect } from "next/navigation";

import { EmptyReferencePage } from "@/components/reports/empty-reference-page";
import { auth } from "@/lib/auth";

export default async function HistoryPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <EmptyReferencePage
      active="history"
      variant="employee"
      title="Report History"
      description="Past daily reports will appear here once report history is connected."
      userName={session.user.name ?? session.user.email}
      userRole={session.user.role === "ADMIN" ? "Admin" : session.user.role === "COO" ? "Reviewer" : "Employee"}
    />
  );
}
