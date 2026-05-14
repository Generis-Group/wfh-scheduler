import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { auth } from "@/lib/auth";
import { getOAuthProviderConfig } from "@/lib/oauth-config";
import { isPreviewBypassEnabled } from "@/lib/preview";

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
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <LoginForm oauthConfig={getOAuthProviderConfig()} previewEnabled={isPreviewBypassEnabled()} />
    </main>
  );
}
