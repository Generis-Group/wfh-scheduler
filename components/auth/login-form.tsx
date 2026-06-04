"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { LogIn } from "lucide-react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FixedToast } from "@/components/ui/fixed-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generisEmailMessage, isGenerisEmail } from "@/lib/auth-domain";
import type { OAuthProviderConfig } from "@/lib/oauth-config";

const oauthButtonClassName =
  "flex h-10 w-full items-center justify-center gap-3 rounded-[8px] border border-[#dfe5ef] bg-white px-3 text-sm font-semibold text-[#344054] shadow-[0_1px_2px_rgba(15,23,42,0.035)] transition-colors hover:border-[#cbd5e1] hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#263a55] dark:bg-white/[0.04] dark:text-[#e2e8f0] dark:hover:bg-white/[0.08]";

export function LoginForm({
  oauthConfig,
}: {
  oauthConfig: OAuthProviderConfig;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!isGenerisEmail(email)) {
      setError(generisEmailMessage());
      setIsSubmitting(false);
      return;
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/",
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError("Email or password was not accepted.");
      return;
    }

    window.location.href = result?.url ?? "/";
  }

  return (
    <>
      <Card className="w-full max-w-md shadow-[var(--surface-shadow-strong)]">
        <CardHeader className="space-y-2 px-5 pt-5 text-center">
          <CardTitle className="text-[26px] font-semibold tracking-normal text-[#111827] dark:text-foreground">
            Welcome back
          </CardTitle>
          <CardDescription>
            Sign in with your @generisgp.com account to review activity and
            submit reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-5">
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="name@generisgp.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <Button className="w-full" disabled={isSubmitting}>
              <LogIn className="mr-2 h-4 w-4" />
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          <div className="space-y-2">
            <OAuthSignInButton
              disabled={!oauthConfig.google}
              icon={<GoogleLogo className="h-[18px] w-[18px] shrink-0" />}
              label="Sign in with Google"
              provider="google"
              unavailableLabel="Google OAuth is not configured"
            />
            <OAuthSignInButton
              disabled={!oauthConfig.atlassian}
              icon={<AtlassianLogo className="h-[18px] w-[18px] shrink-0" />}
              label="Sign in with Atlassian"
              provider="atlassian"
              unavailableLabel="Atlassian OAuth is not configured"
            />
          </div>
          <p className="rounded-[8px] bg-[#f6f8fb] px-3 py-2 text-xs font-medium text-[#667085] dark:bg-white/[0.035] dark:text-muted-foreground">
            Only @generisgp.com accounts can sign in.
          </p>
          {!oauthConfig.google || !oauthConfig.atlassian ? (
            <p className="text-xs text-muted-foreground">
              OAuth sign-in buttons are enabled after client IDs and secrets are added to `.env.local`.
            </p>
          ) : null}
        </CardContent>
      </Card>
      <FixedToast message={error} onDismiss={() => setError(null)} />
    </>
  );
}

function OAuthSignInButton({
  disabled,
  icon,
  label,
  provider,
  unavailableLabel,
}: {
  disabled: boolean;
  icon: ReactNode;
  label: string;
  provider: "google" | "atlassian";
  unavailableLabel: string;
}) {
  return (
    <button
      type="button"
      className={oauthButtonClassName}
      disabled={disabled}
      title={disabled ? unavailableLabel : label}
      onClick={() => signIn(provider, { callbackUrl: "/" })}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.41 5.41 0 0 1 3.69 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.62 8.62 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

function AtlassianLogo({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#2684FF"
        d="M6.94 10.85a.77.77 0 0 0-1.32.14L.09 22.05A.77.77 0 0 0 .78 23.16h7.7a.74.74 0 0 0 .69-.43c1.66-3.42.65-8.63-2.23-11.88z"
      />
      <path
        fill="#0052CC"
        d="M11.67 1.28a13.28 13.28 0 0 0 .78 13.11l3.72 7.43a.77.77 0 0 0 .69.43h7.7a.77.77 0 0 0 .69-1.11L13.01 1.27a.77.77 0 0 0-1.34.01z"
      />
    </svg>
  );
}
