import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { ReactNode } from "react";

import { AppShellLoadingFallback } from "@/components/reports/app-shell-loading-fallback";
import { ReferenceAppShell } from "@/components/reports/reference-shell";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function roleLabel(role?: string | null) {
  if (role === "ADMIN") {
    return "Admin";
  }

  if (role === "REVIEWER") {
    return "Reviewer";
  }

  return "Employee";
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AppShellLoadingFallback />}>
      <AuthenticatedAppShell>{children}</AuthenticatedAppShell>
    </Suspense>
  );
}

async function AuthenticatedAppShell({ children }: { children: ReactNode }) {
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

  const isReviewer =
    session.user.role === "REVIEWER" || session.user.role === "ADMIN";
  const shellUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { image: true },
  });

  return (
    <ReferenceAppShell
      variant={isReviewer ? "admin" : "employee"}
      displayName={session.user.name ?? session.user.email ?? "User"}
      userEmail={session.user.email}
      profileImage={shellUser?.image ?? session.user.image}
      userRole={roleLabel(session.user.role)}
      mustChangePassword={session.user.mustChangePassword}
    >
      {children}
    </ReferenceAppShell>
  );
}
