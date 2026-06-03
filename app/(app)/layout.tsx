import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { ReferenceAppShell } from "@/components/reports/reference-shell";
import { auth } from "@/lib/auth";
import { withServerTiming } from "@/lib/performance";
import { prisma } from "@/lib/prisma";
import { hasUserRole, roleListLabel } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AuthenticatedAppShell>{children}</AuthenticatedAppShell>;
}

async function AuthenticatedAppShell({ children }: { children: ReactNode }) {
  const session = await withServerTiming("app-shell:auth", () => auth());

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.status === "DISABLED") {
    redirect("/api/auth/signout?callbackUrl=/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  let shellVariant: "employee" | "reviewer" | "admin" = "employee";

  if (!hasUserRole(session.user, "EMPLOYEE")) {
    shellVariant = hasUserRole(session.user, "ADMIN") ? "admin" : "reviewer";
  }

  const shellUser = session.user.image
    ? null
    : await withServerTiming("app-shell:profile-image", () =>
        prisma.user.findUnique({
          where: { id: session.user.id },
          select: { image: true },
        }),
      );
  const profileImage = session.user.image ?? shellUser?.image ?? null;

  return (
    <ReferenceAppShell
      variant={shellVariant}
      displayName={session.user.name ?? session.user.email ?? "User"}
      userEmail={session.user.email}
      profileImage={profileImage}
      userRole={roleListLabel(session.user)}
      userRoles={session.user.roles}
      mustChangePassword={session.user.mustChangePassword}
    >
      {children}
    </ReferenceAppShell>
  );
}
