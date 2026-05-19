"use client";

import { useState } from "react";
import { CalendarDays, KanbanSquare, LogIn } from "lucide-react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generisEmailMessage, isGenerisEmail } from "@/lib/auth-domain";
import type { OAuthProviderConfig } from "@/lib/oauth-config";

export function LoginForm({
  oauthConfig
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
      callbackUrl: "/"
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError("Email or password was not accepted.");
      return;
    }

    window.location.href = result?.url ?? "/";
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in with your @generisgp.com account to review activity and submit reports.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" disabled={isSubmitting}>
            <LogIn className="mr-2 h-4 w-4" />
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            disabled={!oauthConfig.google}
            title={oauthConfig.google ? "Sign in with Google" : "Google OAuth is not configured"}
            onClick={() => signIn("google", { callbackUrl: "/" })}
          >
            <CalendarDays className="mr-2 h-4 w-4" />
            Google
          </Button>
          <Button
            variant="outline"
            disabled={!oauthConfig.atlassian}
            title={oauthConfig.atlassian ? "Sign in with Atlassian" : "Atlassian OAuth is not configured"}
            onClick={() => signIn("atlassian", { callbackUrl: "/" })}
          >
            <KanbanSquare className="mr-2 h-4 w-4" />
            Atlassian
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Only @generisgp.com accounts can sign in.</p>
        {!oauthConfig.google || !oauthConfig.atlassian ? (
          <p className="text-xs text-muted-foreground">
            OAuth buttons are enabled after client IDs and secrets are added to `.env.local`.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
