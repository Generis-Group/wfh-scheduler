import { redirect } from "next/navigation";
import Image from "next/image";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { auth } from "@/lib/auth";
import generisLogo from "@/images/Generis_logo.png";

export default async function ChangePasswordPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.status === "DISABLED") {
    redirect("/api/auth/signout?callbackUrl=/login");
  }

  if (!session.user.mustChangePassword) {
    redirect("/");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#f6f8fb] px-4 py-10 dark:bg-background">
      <div className="absolute left-6 top-6">
        <Image
          src={generisLogo}
          alt="Generis"
          className="h-auto w-[162px]"
          priority
        />
      </div>
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <ChangePasswordForm />
    </main>
  );
}
