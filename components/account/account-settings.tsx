"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, KeyRound, Save, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markServerDataStale } from "@/lib/client-cache-invalidation";
import { cn, initials } from "@/lib/utils";

export type AccountUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: string;
  mustChangePassword: boolean;
  hasPassword: boolean;
};

export function AccountSettings({
  user,
  embedded = false,
}: {
  user: AccountUser;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [profileImage, setProfileImage] = useState(user.image ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage(null);

    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || null,
        email,
        image: profileImage || null,
      }),
    });
    const body = await response.json().catch(() => ({}));

    if (response.ok) {
      markServerDataStale();
      router.refresh();
    }

    setProfileMessage(
      response.ok
        ? "Profile saved."
        : (body.error ?? "Unable to save profile."),
    );
    setIsSavingProfile(false);
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
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
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const body = await response.json().catch(() => ({}));

    if (response.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      markServerDataStale();
    }

    setPasswordMessage(
      response.ok
        ? "Password updated."
        : (body.error ?? "Unable to update password."),
    );
    setIsSavingPassword(false);
  }

  async function selectProfileImage(file?: File | null) {
    if (!file) {
      return;
    }

    setProfileMessage(null);

    try {
      const standardizedImage = await standardizeProfileImage(file);
      setProfileImage(standardizedImage);
      setProfileMessage("Profile picture ready to save.");
    } catch (error) {
      setProfileMessage(
        error instanceof Error
          ? error.message
          : "Unable to load that profile picture.",
      );
    }
  }

  const content = (
    <div
      className={cn(
        "grid min-w-0 items-start gap-4",
        user.hasPassword && "min-[1080px]:grid-cols-[minmax(0,1fr)_420px]",
      )}
    >
      <Card className="flex flex-col overflow-hidden min-[1080px]:min-h-[414px]">
        <CardHeader className="px-5 py-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary dark:bg-white/[0.06]">
              <UserRound className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-[18px]">Profile</CardTitle>
              <CardDescription>
                Update your personal information and profile.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col px-5 pb-5">
          <form className="flex flex-1 flex-col gap-5" onSubmit={saveProfile}>
            <div className="relative flex min-h-[114px] flex-wrap items-center gap-5 rounded-lg border border-border bg-white px-5 py-4 shadow-[inset_0_1px_0_rgba(15,23,42,0.02)] dark:border-border dark:bg-background">
              <button
                type="button"
                className="group relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary bg-cover bg-center text-[30px] font-semibold text-white shadow-[0_20px_45px_rgba(29,78,216,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-primary"
                style={
                  profileImage
                    ? { backgroundImage: `url("${profileImage}")` }
                    : undefined
                }
                aria-label="Choose profile picture"
                onClick={() => fileInputRef.current?.click()}
              >
                {profileImage ? null : initials(name || email || "User")}
                <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-primary text-white shadow-[0_8px_16px_rgba(29,78,216,0.28)] transition-colors group-hover:bg-primary-strong dark:border-background">
                  <Camera className="h-4 w-4" />
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  selectProfileImage(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <div className="min-w-0 flex-1 basis-48">
                <div className="truncate text-[17px] font-semibold text-foreground dark:text-foreground">
                  {name.trim() || "Your name"}
                </div>
                <div className="mt-1 truncate text-sm text-muted-foreground dark:text-muted-foreground">
                  {email.trim() || "name@generisgp.com"}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="account-name">Name</Label>
                <div className="relative h-11">
                  <Input
                    id="account-name"
                    className="h-11"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-email">Email</Label>
                <div className="relative h-11">
                  <Input
                    id="account-email"
                    className="h-11"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@generisgp.com"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 dark:border-border">
              <p
                className={cn(
                  "min-h-5 text-sm",
                  profileMessage?.includes("Unable") ||
                    profileMessage?.includes("Choose")
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {profileMessage}
              </p>
              <Button
                className="min-w-40 bg-primary hover:bg-primary"
                disabled={isSavingProfile}
              >
                <Save className="mr-2 h-4 w-4" />
                {isSavingProfile ? "Saving..." : "Save profile"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {user.hasPassword ? (
        <Card className="overflow-hidden">
          <CardHeader className="px-5 py-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary dark:bg-white/[0.06]">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <CardTitle className="text-[18px]">Password</CardTitle>
                <CardDescription>
                  Change your credentials password.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <form className="space-y-4" onSubmit={savePassword}>
              <div className="space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={8}
                />
              </div>
              {passwordMessage ? (
                <p
                  className={cn(
                    "text-sm",
                    passwordMessage.includes("Unable") ||
                      passwordMessage.includes("match")
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {passwordMessage}
                </p>
              ) : null}
              <Button
                className="mt-2 w-full bg-primary hover:bg-primary"
                disabled={isSavingPassword}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                {isSavingPassword ? "Updating..." : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <main className="reference-page min-[1024px]:flex min-[1024px]:h-full min-[1024px]:min-h-0 min-[1024px]:flex-col">
      <div className="reference-page-header shrink-0">
        <div>
          <h1 className="reference-title">Account Settings</h1>
          <p className="reference-subtitle">
            Manage your profile and credentials.
          </p>
        </div>
      </div>

      <div className="min-[1024px]:min-h-0 min-[1024px]:flex-1 min-[1024px]:overflow-y-auto min-[1024px]:overscroll-contain min-[1024px]:pr-1 min-[1024px]:[scrollbar-gutter:stable]">
        {content}
      </div>
    </main>
  );
}

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read that profile picture."));
    };
    reader.onerror = () =>
      reject(new Error("Unable to read that profile picture."));
    reader.readAsDataURL(file);
  });
}

async function standardizeProfileImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file for your profile picture.");
  }

  const dataUrl = await readImageFile(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Unable to load that profile picture."));
    img.src = dataUrl;
  });
  const size = 256;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to prepare that profile picture.");
  }

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);

  canvas.width = size;
  canvas.height = size;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    size,
    size,
  );

  return canvas.toDataURL("image/jpeg", 0.86);
}
