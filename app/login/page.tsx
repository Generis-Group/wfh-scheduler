import { redirect } from "next/navigation";
import Image from "next/image";

import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { auth } from "@/lib/auth";
import { getOAuthProviderConfig } from "@/lib/oauth-config";
import generisLogo from "@/images/Generis_logo.png";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user?.status === "DISABLED") {
    redirect("/api/auth/signout?callbackUrl=/login");
  }

  if (session?.user?.mustChangePassword) {
    redirect("/change-password");
  }

  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden bg-[#f6f8fb] px-3 py-4 dark:bg-background sm:min-h-screen sm:px-4 sm:py-10">
      <div className="flex w-full max-w-md flex-col gap-4 sm:contents">
        <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
          <div className="min-w-0 sm:absolute sm:left-6 sm:top-6">
            <Image
              src={generisLogo}
              alt="Generis"
              className="h-auto w-[min(162px,calc(100vw-5.25rem))] sm:w-[162px]"
              priority
            />
          </div>
          <div className="shrink-0 sm:absolute sm:right-6 sm:top-6">
            <ThemeToggle />
          </div>
        </div>
        <LoginForm oauthConfig={getOAuthProviderConfig()} />
      </div>
    </main>
  );
}
