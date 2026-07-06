"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

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

export function ResetPasswordForm({
  email,
  token,
}: {
  email: string;
  token: string;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, password }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setMessage(body?.error ?? "Unable to reset password.");
      return;
    }

    window.location.href = "/login?reset=1";
  }

  return (
    <>
      <Card className="w-full max-w-md shadow-[var(--surface-shadow-strong)]">
        <CardHeader className="space-y-2 px-5 pt-5 text-center">
          <CardTitle className="text-[26px] font-semibold tracking-normal text-foreground dark:text-foreground">
            Reset password
          </CardTitle>
          <CardDescription>
            Choose a new password for {email}.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
            <Button className="w-full" disabled={isSubmitting}>
              <KeyRound className="mr-2 h-4 w-4" />
              {isSubmitting ? "Saving..." : "Save password"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <FixedToast message={message} onDismiss={() => setMessage(null)} />
    </>
  );
}
