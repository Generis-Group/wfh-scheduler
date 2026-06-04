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
import { markServerDataStale } from "@/lib/client-cache-invalidation";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage("New passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const response = await fetch("/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setMessage(body?.error ?? "Unable to change password.");
      setIsSubmitting(false);
      return;
    }

    markServerDataStale();
    window.location.href = "/";
  }

  return (
    <>
      <Card className="w-full max-w-md shadow-[var(--surface-shadow-strong)]">
        <CardHeader className="space-y-2 px-5 pt-5 text-center">
          <CardTitle className="text-[26px] font-semibold tracking-normal text-[#111827] dark:text-foreground">
            Change temporary password
          </CardTitle>
          <CardDescription>
            Set a permanent password before continuing to the reporting app.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Temporary password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
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
