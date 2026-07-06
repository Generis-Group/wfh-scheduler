import Image from "next/image";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import generisLogo from "@/images/Generis_logo.png";

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const email =
    typeof searchParams?.email === "string" ? searchParams.email : "";
  const token =
    typeof searchParams?.token === "string" ? searchParams.token : "";

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden bg-surface-subtle px-3 py-4 dark:bg-background sm:min-h-screen sm:px-4 sm:py-10">
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
        {email && token ? (
          <ResetPasswordForm email={email} token={token} />
        ) : (
          <Card className="w-full max-w-md shadow-[var(--surface-shadow-strong)]">
            <CardHeader className="space-y-2 px-5 pt-5 text-center">
              <CardTitle className="text-[26px] font-semibold tracking-normal text-foreground dark:text-foreground">
                Reset link missing
              </CardTitle>
              <CardDescription>
                Request a new password reset link from the login page.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <Button asChild className="w-full">
                <Link href="/login">Back to login</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
