import { redirect } from "next/navigation";

import { AccountSettings } from "@/components/account/account-settings";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serializers";

export default async function AccountPage() {
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

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      timezone: true,
      mustChangePassword: true,
      passwordHash: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <AccountSettings
      user={serialize({
        ...user,
        passwordHash: undefined,
        hasPassword: Boolean(user.passwordHash),
      })}
    />
  );
}
