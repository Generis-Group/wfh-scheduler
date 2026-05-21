"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import type { ElementType, MouseEvent, ReactNode } from "react";
import {
  BarChart3,
  ChevronDown,
  CircleUser,
  ClipboardList,
  History,
  KeyRound,
  LogOut,
  Settings,
  Users
} from "lucide-react";

import { PageLoadingSkeleton, loadingKindFromHref } from "@/components/reports/page-loading-skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  getFreshServerDataVersion,
  getServerDataVersion,
  refreshStaleServerData,
  serverDataFreshEvent,
  serverDataStaleEvent
} from "@/lib/client-cache-invalidation";
import { cn, initials } from "@/lib/utils";
import generisLogo from "@/images/Generis_logo.png";

type NavItem = {
  href: string;
  label: string;
  icon: ElementType;
  key: string;
};

const employeeNav: NavItem[] = [
  { href: "/", label: "Daily", icon: ClipboardList, key: "report" },
  { href: "/reports", label: "Reports", icon: History, key: "reports" },
  { href: "/settings", label: "Settings", icon: Settings, key: "settings" },
  { href: "/account", label: "Account", icon: CircleUser, key: "account" }
];

const adminNav: NavItem[] = [
  { href: "/review", label: "Review", icon: BarChart3, key: "review" },
  { href: "/admin", label: "Employees", icon: Users, key: "employees" },
  { href: "/settings", label: "Settings", icon: Settings, key: "settings" },
  { href: "/account", label: "Account", icon: CircleUser, key: "account" }
];

export function ReferenceAppShell({
  children,
  active,
  variant,
  userName,
  userEmail,
  userRole,
  userStatus,
  timezone,
  mustChangePassword,
  currentReportDate
}: {
  children: ReactNode;
  active: string;
  variant: "employee" | "admin";
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  userStatus?: string | null;
  timezone?: string | null;
  mustChangePassword?: boolean;
  currentReportDate?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nav = variant === "admin" ? adminNav : employeeNav;
  const displayName = userName || (variant === "admin" ? "Admin User" : "Employee User");
  const displayEmail = userEmail ?? (userName?.includes("@") ? userName : null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileDetailsOpen, setProfileDetailsOpen] = useState(false);
  const [lastReportDate, setLastReportDate] = useState<string | null>(currentReportDate ?? null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [optimisticActive, setOptimisticActive] = useState(active);
  const [serverDataVersion, setServerDataVersion] = useState(0);
  const [freshServerDataVersion, setFreshServerDataVersion] = useState(0);
  const settingsHref = "/settings";
  const currentHref = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;
  const logoHref = variant === "admin" ? "/review" : "/";
  const mobileLogoHref = "/";
  const hasStalePrefetchedData = serverDataVersion !== freshServerDataVersion;

  useEffect(() => {
    if (variant !== "employee") {
      return;
    }

    if (currentReportDate) {
      window.localStorage.setItem("generis.lastReportDate", currentReportDate);
      setLastReportDate(currentReportDate);
      return;
    }

    const storedDate = window.localStorage.getItem("generis.lastReportDate");
    if (storedDate) {
      setLastReportDate(storedDate);
    }
  }, [currentReportDate, variant]);

  useEffect(() => {
    setPendingHref(null);
    setOptimisticActive(active);
  }, [active, pathname, searchParams]);

  useEffect(() => {
    function syncServerDataVersions() {
      setServerDataVersion(getServerDataVersion());
      setFreshServerDataVersion(getFreshServerDataVersion());
    }

    syncServerDataVersions();
    window.addEventListener(serverDataStaleEvent, syncServerDataVersions);
    window.addEventListener(serverDataFreshEvent, syncServerDataVersions);

    return () => {
      window.removeEventListener(serverDataStaleEvent, syncServerDataVersions);
      window.removeEventListener(serverDataFreshEvent, syncServerDataVersions);
    };
  }, []);

  useEffect(() => {
    if (hasStalePrefetchedData) {
      return;
    }

    const hrefs = [
      logoHref,
      mobileLogoHref,
      settingsHref,
      "/account",
      ...nav.map((item) => getNavHref(item, lastReportDate))
    ];

    hrefs.forEach((href) => {
      if (href !== currentHref) {
        router.prefetch(href);
      }
    });
  }, [currentHref, hasStalePrefetchedData, lastReportDate, logoHref, mobileLogoHref, nav, router, settingsHref]);

  function routeLinkProps(href: string, activeKey?: string) {
    return {
      prefetch: !hasStalePrefetchedData,
      onMouseEnter: () => {
        if (!hasStalePrefetchedData) {
          router.prefetch(href);
        }
      },
      onFocus: () => {
        if (!hasStalePrefetchedData) {
          router.prefetch(href);
        }
      },
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          href === currentHref
        ) {
          return;
        }

        setPendingHref(href);
        if (activeKey) {
          setOptimisticActive(activeKey);
        }
        setProfileOpen(false);

        if (hasStalePrefetchedData) {
          event.preventDefault();
          refreshStaleServerData(router);
          router.push(href);
        }
      }
    };
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-[#0f172a] dark:bg-background dark:text-foreground lg:grid lg:grid-cols-[176px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-screen min-w-0 flex-col bg-white/88 px-3 py-4 shadow-[1px_0_0_rgba(15,23,42,0.04)] backdrop-blur-xl dark:bg-[#0b1422]/96 dark:shadow-[1px_0_0_rgba(255,255,255,0.04)] lg:flex">
          <Link href={logoHref} {...routeLinkProps(logoHref, variant === "admin" ? "review" : "report")} className="flex items-center rounded-[10px] px-1.5 py-1 transition-colors hover:bg-[#eef4fb] dark:hover:bg-white/[0.06]">
            <span className="relative flex h-7 w-[132px] items-center overflow-hidden">
              <Image src={generisLogo} alt="Generis" className="h-auto w-full object-contain" priority />
            </span>
          </Link>
          <nav className="mt-6 space-y-0.5">
            {nav.map((item) => {
              const Icon = item.icon;
              const href = getNavHref(item, lastReportDate);

              return (
                <Link
                  key={item.key}
                  href={href}
                  {...routeLinkProps(href, item.key)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] font-semibold transition-colors",
                    optimisticActive === item.key
                      ? "bg-[#eff6ff] text-[#2563eb] dark:bg-blue-400/10 dark:text-[#bfdbfe]"
                      : "text-[#52647a] hover:bg-[#eef4fb] hover:text-[#0f172a] dark:text-[#93a4b8] dark:hover:bg-white/[0.06] dark:hover:text-[#e2e8f0]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
      <div className="min-w-0">
      <header className="sticky top-0 z-20 bg-white/92 shadow-[0_1px_0_rgba(15,23,42,0.05)] backdrop-blur-xl dark:bg-[#0b1422]/94 dark:shadow-[0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex h-12 w-full items-center justify-between gap-3 px-[clamp(14px,1.7vw,26px)] lg:justify-end">
          <div className="flex h-full min-w-0 items-center gap-[clamp(16px,2.2vw,34px)] lg:hidden">
            <Link href={mobileLogoHref} {...routeLinkProps(mobileLogoHref, variant === "admin" ? "review" : "report")} className="flex shrink-0 items-center rounded-[10px] px-1.5 py-1 transition-colors hover:bg-[#eef4fb] dark:hover:bg-white/[0.06]">
              <span className="relative flex h-7 w-[132px] items-center overflow-hidden">
                <Image src={generisLogo} alt="Generis" className="h-auto w-full object-contain" priority />
              </span>
            </Link>

            <nav className="hidden h-full items-center gap-1 md:flex">
              {nav.map((item) => {
                const Icon = item.icon;
                const href = getNavHref(item, lastReportDate);

                return (
                  <Link
                    key={item.key}
                    href={href}
                    {...routeLinkProps(href, item.key)}
                    className={cn(
                      "flex h-full items-center gap-2 border-b-[3px] px-4 text-sm font-semibold transition-colors",
                      optimisticActive === item.key
                        ? "border-[#2563eb] text-[#2563eb] dark:border-[#60a5fa] dark:text-[#bfdbfe]"
                        : "border-transparent text-[#52647a] hover:text-[#0f172a] dark:text-[#93a4b8] dark:hover:text-[#e2e8f0]"
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="relative flex items-center gap-2">
            <ThemeToggle />
            <button
              className="flex min-w-0 items-center gap-2 rounded-[10px] px-1.5 py-1 transition-colors hover:bg-[#eef4fb] dark:hover:bg-white/[0.06]"
              onClick={() => {
                setProfileOpen((open) => !open);
              }}
              aria-expanded={profileOpen}
              aria-haspopup="menu"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1d4ed8] text-xs font-semibold text-white shadow-[0_8px_18px_rgba(29,78,216,0.22)] dark:bg-[#1d4ed8]">
                {initials(displayName)}
              </div>
              <div className="hidden max-w-[200px] truncate text-sm font-semibold text-[#0f172a] dark:text-[#e2e8f0] sm:block">
                {displayName}
              </div>
              <ChevronDown className={cn("h-4 w-4 text-[#64748b] transition-transform dark:text-[#94a3b8]", profileOpen && "rotate-180")} />
            </button>
            {profileOpen ? (
              <div
                className="absolute right-0 top-12 z-30 w-72 overflow-hidden rounded-[12px] border border-[#dbe3ee] bg-[#ffffff] p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.16)] dark:border-[#24354c] dark:bg-[#0f1b2a] dark:shadow-[0_18px_45px_rgba(0,0,0,0.42)]"
                role="menu"
              >
                <div className="rounded-[8px] bg-[#f8fafc] px-3 py-2 dark:bg-[#0b1523]">
                  <div className="truncate text-sm font-semibold text-[#0f172a] dark:text-[#e2e8f0]">{displayName}</div>
                  <div className="text-xs text-[#64748b] dark:text-[#94a3b8]">{userRole || (variant === "admin" ? "Reviewer" : "Employee")}</div>
                </div>
                <button
                  className="mt-1.5 flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-sm text-[#334155] transition-colors hover:bg-[#f1f5f9] dark:text-[#d7e0ec] dark:hover:bg-[#17263a]"
                  onClick={() => setProfileDetailsOpen((open) => !open)}
                >
                  <CircleUser className="h-4 w-4" />
                  Profile details
                </button>
                {profileDetailsOpen ? (
                  <div className="mx-1 mb-1 rounded-[8px] bg-[#f8fafc] px-3 py-2 text-xs text-[#475569] ring-1 ring-[#e2e8f0] dark:bg-[#0b1523] dark:text-[#94a3b8] dark:ring-[#24354c]">
                    <ProfileLine label="Name" value={displayName} />
                    <ProfileLine label="Email" value={displayEmail ?? "Not set"} />
                    <ProfileLine label="Role" value={userRole || (variant === "admin" ? "Reviewer" : "Employee")} />
                    <ProfileLine label="Status" value={userStatus ?? "Active"} />
                    <ProfileLine label="Timezone" value={timezone ?? "America/Toronto"} />
                  </div>
                ) : null}
                <Link href="/account" {...routeLinkProps("/account", "account")} className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-sm text-[#334155] transition-colors hover:bg-[#f1f5f9] dark:text-[#d7e0ec] dark:hover:bg-[#17263a]">
                  <CircleUser className="h-4 w-4" />
                  Account settings
                </Link>
                {mustChangePassword ? (
                  <Link href="/change-password" {...routeLinkProps("/change-password", "account")} className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-sm text-[#334155] transition-colors hover:bg-[#f1f5f9] dark:text-[#d7e0ec] dark:hover:bg-[#17263a]">
                    <KeyRound className="h-4 w-4" />
                    Change password
                  </Link>
                ) : null}
                <button
                  className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-sm text-[#334155] transition-colors hover:bg-[#f1f5f9] dark:text-[#d7e0ec] dark:hover:bg-[#17263a]"
                  onClick={() => {
                    signOut({ callbackUrl: "/login" });
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <nav className="flex h-11 items-center gap-2 overflow-x-auto px-[clamp(14px,1.7vw,26px)] shadow-[0_-1px_0_rgba(15,23,42,0.04)] dark:shadow-[0_-1px_0_rgba(255,255,255,0.04)] md:hidden">
          {nav.map((item) => {
            const Icon = item.icon;
            const href = getNavHref(item, lastReportDate);

            return (
              <Link
                key={item.key}
                href={href}
                {...routeLinkProps(href, item.key)}
                className={cn(
                  "flex h-full shrink-0 items-center gap-2 border-b-[3px] px-2 text-sm font-semibold transition-colors",
                  optimisticActive === item.key
                    ? "border-[#2563eb] text-[#2563eb] dark:border-[#60a5fa] dark:text-[#93c5fd]"
                    : "border-transparent text-[#475569] hover:text-[#0f172a] dark:text-[#94a3b8] dark:hover:text-[#e2e8f0]"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {pendingHref ? <PageLoadingSkeleton kind={loadingKindFromHref(pendingHref, variant)} /> : children}
      </div>
    </div>
  );
}

function ProfileLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="font-medium text-[#64748b] dark:text-[#94a3b8]">{label}</span>
      <span className="max-w-[145px] truncate text-right text-[#0f172a] dark:text-[#e2e8f0]">{value}</span>
    </div>
  );
}

function getNavHref(item: NavItem, lastReportDate?: string | null) {
  if (item.key === "report" && lastReportDate) {
    return `/?date=${lastReportDate}`;
  }

  return item.href;
}

export function ReferencePanel({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("reference-card min-w-0", className)}>{children}</section>;
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
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
    orange: "bg-orange-50 text-orange-700 dark:bg-orange-400/10 dark:text-orange-300",
    red: "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
    neutral: "bg-[#f4f7fb] text-[#52647a] dark:bg-white/[0.045] dark:text-[#b5c2d3]"
  };

  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-[7px] px-2.5 py-1 text-xs font-semibold leading-none", tones[tone], className)}>
      {children}
    </span>
  );
}

export function EmptyReferenceState({ children }: { children: ReactNode }) {
  return <div className="flex min-h-24 items-center justify-center rounded-[10px] border border-dashed border-[#cbd5e1] bg-[#f8fafc]/80 px-4 text-center text-sm text-[#64748b] dark:border-[#2b3c54] dark:bg-[#0b1523]/80 dark:text-muted-foreground">{children}</div>;
}
