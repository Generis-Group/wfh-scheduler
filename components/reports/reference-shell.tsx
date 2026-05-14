"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useState } from "react";
import type { ElementType, ReactNode } from "react";
import {
  BarChart3,
  ChevronDown,
  CircleUser,
  ClipboardList,
  History,
  LogOut,
  Settings,
  Users
} from "lucide-react";

import { cn, initials } from "@/lib/utils";
import generisLogo from "@/images/Generis_logo.jpg";

type NavItem = {
  href: string;
  label: string;
  icon: ElementType;
  key: string;
};

const employeeNav: NavItem[] = [
  { href: "/", label: "Report", icon: ClipboardList, key: "report" },
  { href: "/history", label: "History", icon: History, key: "history" },
  { href: "/settings", label: "Settings", icon: Settings, key: "settings" }
];

const adminNav: NavItem[] = [
  { href: "/review", label: "Review Dashboard", icon: BarChart3, key: "review" },
  { href: "/admin", label: "Employees", icon: Users, key: "employees" },
  { href: "/settings", label: "Settings", icon: Settings, key: "settings" }
];

export function ReferenceAppShell({
  children,
  active,
  variant,
  userName,
  userRole,
  preview = false
}: {
  children: ReactNode;
  active: string;
  variant: "employee" | "admin";
  userName?: string | null;
  userRole?: string | null;
  preview?: boolean;
}) {
  const nav = variant === "admin" ? adminNav : employeeNav;
  const displayName = userName || (variant === "admin" ? "Admin User" : "Employee User");
  const roleLabel = userRole ? ` (${userRole})` : "";
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const settingsHref = preview ? (variant === "admin" ? "/preview/admin-settings" : "/preview/settings") : "/settings";

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#111827]">
      <header className="sticky top-0 z-20 border-b border-[#d9e1ec] bg-white/95 backdrop-blur">
        <div className="flex h-[72px] w-full items-center justify-between px-[clamp(16px,2vw,32px)]">
          <Link href={preview ? "/preview" : "/"} className="flex items-center gap-3">
            <span className="relative flex h-11 w-[136px] overflow-hidden rounded-[6px] bg-white">
              <Image
                src={generisLogo}
                alt="Generis"
                className="absolute -left-4 -top-4 h-[76px] w-[150px] max-w-none object-contain"
                priority
              />
            </span>
            <span className="hidden h-8 border-l border-[#d9e1ec] sm:block" />
            <span className="hidden text-[19px] font-semibold tracking-normal text-[#0f172a] sm:block">Daily Reporting</span>
          </Link>

          <nav className="hidden h-full items-center gap-[clamp(14px,2vw,34px)] md:flex">
            {nav.map((item) => {
              const Icon = item.icon;
              const href = getNavHref(item, preview, variant);

              return (
                <Link
                  key={item.key}
                  href={href}
                  className={cn(
                    "flex h-full items-center gap-2 border-b-[3px] px-[clamp(8px,1vw,18px)] text-[15px] font-medium transition-colors",
                    active === item.key
                      ? "border-[#2563eb] text-[#2563eb]"
                      : "border-transparent text-[#475569] hover:text-[#0f172a]"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="relative">
            <button
              className="flex min-w-0 items-center gap-3 rounded-[8px] px-2 py-1.5 hover:bg-[#f1f5f9]"
              onClick={() => {
                setProfileOpen((open) => !open);
                setProfileNotice(null);
              }}
              aria-expanded={profileOpen}
              aria-haspopup="menu"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#243552] text-sm font-semibold text-white">
                {initials(displayName)}
              </div>
              <div className="hidden max-w-[220px] truncate text-sm font-semibold text-[#0f172a] sm:block">
                {displayName}
                {roleLabel}
              </div>
              <ChevronDown className={cn("h-4 w-4 text-[#475569] transition-transform", profileOpen && "rotate-180")} />
            </button>
            {profileOpen ? (
              <div
                className="absolute right-0 top-12 z-30 w-64 rounded-[8px] border border-[#d9e1ec] bg-white p-2 shadow-lg"
                role="menu"
              >
                <div className="border-b border-[#e2e8f0] px-3 py-2">
                  <div className="truncate text-sm font-semibold text-[#0f172a]">{displayName}</div>
                  <div className="text-xs text-[#64748b]">{userRole || (variant === "admin" ? "Reviewer" : "Employee")}</div>
                </div>
                <button
                  className="mt-2 flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-sm text-[#334155] hover:bg-[#f8fafc]"
                  onClick={() => setProfileNotice("Profile details will be connected with account management.")}
                >
                  <CircleUser className="h-4 w-4" />
                  Profile details
                </button>
                <Link href={settingsHref} className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-sm text-[#334155] hover:bg-[#f8fafc]">
                  <Settings className="h-4 w-4" />
                  Account settings
                </Link>
                <button
                  className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-sm text-[#94a3b8]"
                  onClick={() => {
                    if (preview) {
                      setProfileNotice("Sign out is not connected in the preview shell yet.");
                      return;
                    }

                    signOut({ callbackUrl: "/login" });
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  {preview ? "Sign out unavailable in preview" : "Sign out"}
                </button>
                {profileNotice ? <p className="px-3 pb-2 pt-1 text-xs text-[#64748b]">{profileNotice}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
        <nav className="flex h-12 items-center gap-2 overflow-x-auto border-t border-[#eef2f7] px-[clamp(16px,2vw,32px)] md:hidden">
          {nav.map((item) => {
            const Icon = item.icon;
            const href = getNavHref(item, preview, variant);

            return (
              <Link
                key={item.key}
                href={href}
                className={cn(
                  "flex h-full shrink-0 items-center gap-2 border-b-[3px] px-2 text-sm font-medium transition-colors",
                  active === item.key
                    ? "border-[#2563eb] text-[#2563eb]"
                    : "border-transparent text-[#475569] hover:text-[#0f172a]"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}

function getNavHref(item: NavItem, preview: boolean, variant: "employee" | "admin") {
  if (!preview) {
    return item.href;
  }

  if (item.key === "report") {
    return "/preview/employee";
  }

  if (item.key === "review") {
    return "/preview/admin";
  }

  if (item.key === "settings" && variant === "admin") {
    return "/preview/admin-settings";
  }

  return `/preview/${item.key}`;
}

export function ReferencePanel({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("rounded-[8px] border border-[#d9e1ec] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>{children}</section>;
}

export function ReferenceBadge({
  tone = "neutral",
  children,
  className
}: {
  tone?: "green" | "orange" | "red" | "blue" | "neutral";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    green: "border-[#b7e4bf] bg-[#ecfdf0] text-[#15803d]",
    orange: "border-[#fed7aa] bg-[#fff7ed] text-[#ea580c]",
    red: "border-[#fecaca] bg-[#fef2f2] text-[#dc2626]",
    blue: "border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]",
    neutral: "border-[#d9e1ec] bg-[#f8fafc] text-[#475569]"
  };

  return (
    <span className={cn("inline-flex items-center rounded-[5px] border px-2.5 py-1 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

export function EmptyReferenceState({ children }: { children: ReactNode }) {
  return <div className="flex min-h-24 items-center justify-center rounded-[8px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] text-sm text-[#64748b]">{children}</div>;
}
