"use client";

import { useState } from "react";
import { KeyRound, Moon, Palette, Save, ShieldCheck, Sun, UserRound } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { markServerDataStale } from "@/lib/client-cache-invalidation";
import { cn, titleCase } from "@/lib/utils";

type AccountUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
  status: string;
  timezone: string;
  mustChangePassword: boolean;
  hasPassword: boolean;
};

const timezoneOptions = [
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC"
];

export function AccountSettings({ user }: { user: AccountUser }) {
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(user.name ?? "");
  const [timezone, setTimezone] = useState(user.timezone || "America/Toronto");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage(null);

    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || null,
        timezone
      })
    });
    const body = await response.json().catch(() => ({}));

    if (response.ok) {
      markServerDataStale();
    }

    setProfileMessage(response.ok ? "Account details saved." : body.error ?? "Unable to save account details.");
    setIsSavingProfile(false);
  }

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage("New passwords do not match.");
      return;
    }

    setIsSavingPassword(true);
    const response = await fetch("/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const body = await response.json().catch(() => ({}));

    if (response.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      markServerDataStale();
    }

    setPasswordMessage(response.ok ? "Password updated." : body.error ?? "Unable to update password.");
    setIsSavingPassword(false);
  }

  return (
    <main className="reference-page">
      <div className="reference-page-header">
        <div>
          <h1 className="reference-title">Account Settings</h1>
          <p className="reference-subtitle">Manage your profile, timezone, and credentials.</p>
        </div>
      </div>

      <div className="grid items-start gap-4 min-[1120px]:grid-cols-[minmax(0,1fr)_390px]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <UserRound className="h-5 w-5 text-[#2563eb]" />
              <div>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Your reporting identity and local reporting timezone.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={saveProfile}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="account-name">Name</Label>
                  <Input id="account-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={user.email ?? ""} disabled />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Input value={titleCase(user.role)} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Input value={titleCase(user.status)} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account-timezone">Timezone</Label>
                  <Select id="account-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                    {timezoneOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={cn("text-sm", profileMessage?.includes("Unable") ? "text-[#dc2626]" : "text-[#64748b]")}>{profileMessage}</p>
                <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" disabled={isSavingProfile}>
                  <Save className="mr-2 h-4 w-4" />
                  {isSavingProfile ? "Saving..." : "Save profile"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-[#16a34a]" />
                <div>
                  <CardTitle>Access</CardTitle>
                  <CardDescription>Generis accounts are restricted to company email.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[#475569]">
              <div className="reference-card-muted p-3">
                Required domain: <span className="font-semibold text-[#0f172a]">@generisgp.com</span>
              </div>
              <div className="reference-card-muted p-3">
                Account type: <span className="font-semibold text-[#0f172a]">{user.hasPassword ? "Credentials enabled" : "OAuth only"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Palette className="h-5 w-5 text-[#2563eb]" />
                <div>
                  <CardTitle>Appearance</CardTitle>
                  <CardDescription>Choose the interface theme for this browser.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 rounded-[10px] bg-[#f8fafc] p-1 dark:bg-[#0b1523]">
                <button
                  type="button"
                  className={cn(
                    "flex h-10 items-center justify-center gap-2 rounded-[6px] text-sm font-semibold transition-colors",
                    theme === "light"
                      ? "bg-white text-[#0f172a] shadow-sm dark:bg-[#1e293b] dark:text-white dark:ring-1 dark:ring-border"
                      : "text-[#64748b] dark:text-muted-foreground"
                  )}
                  onClick={() => setTheme("light")}
                >
                  <Sun className="h-4 w-4" />
                  Light
                </button>
                <button
                  type="button"
                  className={cn(
                    "flex h-10 items-center justify-center gap-2 rounded-[6px] text-sm font-semibold transition-colors",
                    theme === "dark"
                      ? "bg-white text-[#0f172a] shadow-sm dark:bg-[#1e293b] dark:text-white dark:ring-1 dark:ring-border"
                      : "text-[#64748b] dark:text-muted-foreground"
                  )}
                  onClick={() => setTheme("dark")}
                >
                  <Moon className="h-4 w-4" />
                  Dark
                </button>
              </div>
              <p className="text-sm text-[#64748b]">This preference is saved locally on this device.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <KeyRound className="h-5 w-5 text-[#2563eb]" />
                <div>
                  <CardTitle>Password</CardTitle>
                  <CardDescription>{user.hasPassword ? "Change your credentials password." : "This account signs in with OAuth."}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {user.hasPassword ? (
                <form className="space-y-4" onSubmit={savePassword}>
                  <div className="space-y-2">
                    <Label htmlFor="current-password">Current password</Label>
                    <Input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New password</Label>
                    <Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <Input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} />
                  </div>
                  {passwordMessage ? <p className={cn("text-sm", passwordMessage.includes("Unable") || passwordMessage.includes("match") ? "text-[#dc2626]" : "text-[#64748b]")}>{passwordMessage}</p> : null}
                  <Button className="w-full bg-[#2563eb] hover:bg-[#1d4ed8]" disabled={isSavingPassword}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    {isSavingPassword ? "Updating..." : "Update password"}
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-[#64748b]">Password changes are only available for admin-created credentials accounts.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
