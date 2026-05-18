import { redirect } from "next/navigation";
import Image from "next/image";

import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { auth } from "@/lib/auth";
import { getOAuthProviderConfig } from "@/lib/oauth-config";
import { isPreviewBypassEnabled } from "@/lib/preview";
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
    <main className="relative flex min-h-screen items-center justify-center bg-[#f4f7fb] px-4 py-10 dark:bg-background">
      <div className="absolute left-6 top-6">
        <Image src={generisLogo} alt="Generis" className="h-auto w-[162px]" priority />
      </div>
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <LoginForm oauthConfig={getOAuthProviderConfig()} previewEnabled={isPreviewBypassEnabled()} />
    </main>
  );
}
