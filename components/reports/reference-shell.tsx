"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Users,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { useDismissableLayer } from "@/components/ui/use-dismissable-layer";
import {
  loadingKindFromHref,
  PageLoadingSkeleton,
  type PageLoadingKind,
} from "@/components/reports/page-loading-skeleton";
import {
  getFreshServerDataVersion,
  getServerDataVersion,
  refreshStaleServerData,
  serverDataFreshEvent,
  serverDataStaleEvent,
} from "@/lib/client-cache-invalidation";
import { clampReportDateToToday, todayDateString } from "@/lib/dates";
import { startClientTiming } from "@/lib/performance";
import { cn, initials } from "@/lib/utils";
import generisLogo from "@/images/Generis_logo.png";

type ShellVariant = "employee" | "reviewer" | "admin";

type NavKey = "report" | "reports" | "review" | "admin" | "settings";

type NavItem = {
  href: string;
  label: string;
  icon: ElementType;
  key: NavKey;
  prefetch: "eager" | "intent";
};

type RememberedDates = {
  lastReportDate?: string | null;
  lastReviewDate?: string | null;
};

type PendingNavigation = {
  activeKey: NavKey | null;
  pageKind: PageLoadingKind | null;
};

const reportDateStorageKey = "generis.lastReportDate";
const reportDateSavedOnStorageKey = "generis.lastReportDateSavedOn";
const reviewDateStorageKey = "generis.lastReviewDate";
const reviewDateSavedOnStorageKey = "generis.lastReviewDateSavedOn";

const employeeNav: NavItem[] = [
  {
    href: "/",
    label: "Daily",
    icon: ClipboardList,
    key: "report",
    prefetch: "eager",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: History,
    key: "reports",
    prefetch: "eager",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    key: "settings",
    prefetch: "intent",
  },
];

const reviewerNav: NavItem[] = [
  {
    href: "/review",
    label: "Review",
    icon: BarChart3,
    key: "review",
    prefetch: "eager",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    key: "settings",
    prefetch: "intent",
  },
];

const adminNav: NavItem[] = [
  {
    href: "/review",
    label: "Review",
    icon: BarChart3,
    key: "review",
    prefetch: "eager",
  },
  {
    href: "/admin",
    label: "Admin",
    icon: Users,
    key: "admin",
    prefetch: "intent",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    key: "settings",
    prefetch: "intent",
  },
];

export function ReferenceAppShell({
  children,
  variant,
  displayName,
  userEmail,
  profileImage,
  userRole,
  userRoles,
  mustChangePassword,
  profileLoading = false,
}: {
  children: ReactNode;
  variant: ShellVariant;
  displayName: string;
  userEmail?: string | null;
  profileImage?: string | null;
  userRole: string;
  userRoles?: string[] | null;
  mustChangePassword: boolean;
  profileLoading?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nav = navForRoles(userRoles, variant);
  const active = activeNavKey(pathname);
  const [profileOpen, setProfileOpen] = useState(false);
  const [lastReportDate, setLastReportDate] = useState<string | null>(null);
  const [lastReviewDate, setLastReviewDate] = useState<string | null>(null);
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);
  const [serverDataVersion, setServerDataVersion] = useState(0);
  const [freshServerDataVersion, setFreshServerDataVersion] = useState(0);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const prefetchedHrefsRef = useRef<Set<string>>(new Set());
  const routeTimingRef = useRef<ReturnType<typeof startClientTiming> | null>(
    null,
  );
  const searchParamString = searchParams?.toString() ?? "";
  const currentHref = `${pathname}${searchParamString ? `?${searchParamString}` : ""}`;
  const routeDateParam = searchParams?.get("date") ?? null;
  const rememberedDates = useMemo(
    () => ({ lastReportDate, lastReviewDate }),
    [lastReportDate, lastReviewDate],
  );
  const logoHref = getLogoHref(userRoles, variant, lastReviewDate);
  const mobileLogoHref = logoHref;
  const logoActiveKey = hasShellRole(userRoles, variant, "EMPLOYEE")
    ? "report"
    : "review";
  const canUseDaily = hasShellRole(userRoles, variant, "EMPLOYEE");
  const canUseReview =
    hasShellRole(userRoles, variant, "REVIEWER") ||
    hasShellRole(userRoles, variant, "ADMIN");
  const hasStalePrefetchedData = serverDataVersion !== freshServerDataVersion;
  const navigationPending = pendingNavigation !== null;
  const visibleActive = pendingNavigation?.activeKey ?? active;
  const pendingPageKind = pendingNavigation?.pageKind ?? null;

  useDismissableLayer({
    open: profileOpen,
    refs: [profileMenuRef],
    onDismiss: () => setProfileOpen(false),
  });

  const prefetchRoute = useCallback(
    (href: string) => {
      const prefetchHref = href.split("#")[0] || "/";

      if (prefetchedHrefsRef.current.has(prefetchHref)) {
        return;
      }

      prefetchedHrefsRef.current.add(prefetchHref);
      router.prefetch(prefetchHref);
    },
    [router],
  );

  useEffect(() => {
    if (!canUseDaily) {
      return;
    }

    const routeReportDate =
      pathname === "/" ? routeDateParam || todayDateString() : null;
    const storedDate = window.localStorage.getItem(reportDateStorageKey);
    const storedSavedOn = window.localStorage.getItem(
      reportDateSavedOnStorageKey,
    );
    const nextReportDate = resolveLastReportDate(
      pathname,
      routeReportDate,
      storedDate,
      storedSavedOn,
    );

    if (routeReportDate) {
      persistRememberedDate(
        reportDateStorageKey,
        reportDateSavedOnStorageKey,
        routeReportDate,
      );
    } else if (!nextReportDate) {
      clearRememberedDate(reportDateStorageKey, reportDateSavedOnStorageKey);
    }

    setLastReportDate(nextReportDate);
  }, [canUseDaily, pathname, routeDateParam]);

  useEffect(() => {
    if (!canUseReview) {
      return;
    }

    const routeReviewDate =
      pathname === "/review" ? routeDateParam || todayDateString() : null;
    const storedDate = window.localStorage.getItem(reviewDateStorageKey);
    const storedSavedOn = window.localStorage.getItem(
      reviewDateSavedOnStorageKey,
    );
    const nextReviewDate = resolveLastReviewDate(
      pathname,
      routeReviewDate,
      storedDate,
      storedSavedOn,
    );

    if (routeReviewDate) {
      persistRememberedDate(
        reviewDateStorageKey,
        reviewDateSavedOnStorageKey,
        routeReviewDate,
      );
    } else if (!nextReviewDate) {
      clearRememberedDate(reviewDateStorageKey, reviewDateSavedOnStorageKey);
    }

    setLastReviewDate(nextReviewDate);
  }, [canUseReview, pathname, routeDateParam]);

  useEffect(() => {
    setPendingNavigation(null);
    resetContentScroll(contentScrollRef.current);
    routeTimingRef.current?.({ status: "committed" });
    routeTimingRef.current = null;
  }, [active, pathname, searchParamString]);

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
      prefetchedHrefsRef.current.clear();
      return;
    }

    const hrefs = [
      logoHref,
      mobileLogoHref,
      ...nav
        .filter((item) => item.prefetch === "eager")
        .map((item) => getNavHref(item, rememberedDates)),
    ];

    hrefs.forEach((href) => {
      if (href !== currentHref) {
        prefetchRoute(href);
      }
    });
  }, [
    currentHref,
    hasStalePrefetchedData,
    logoHref,
    rememberedDates,
    mobileLogoHref,
    nav,
    prefetchRoute,
  ]);

  function routeLinkProps(
    href: string,
    activeKey?: NavKey,
    prefetch: NavItem["prefetch"] = "intent",
  ) {
    const prefetchHref = href.split("#")[0] || "/";

    return {
      prefetch: false,
      onMouseEnter: () => {
        if (!hasStalePrefetchedData && prefetch) {
          prefetchRoute(prefetchHref);
        }
      },
      onFocus: () => {
        if (!hasStalePrefetchedData && prefetch) {
          prefetchRoute(prefetchHref);
        }
      },
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        const hashOnlyCurrentPage =
          href.includes("#") && href.split("#")[0] === currentHref;

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

        if (hashOnlyCurrentPage) {
          setProfileOpen(false);
          return;
        }

        resetContentScroll(contentScrollRef.current);
        routeTimingRef.current = startClientTiming("shell:route-navigation", {
          from: currentHref,
          to: href,
        });
        setPendingNavigation({
          activeKey: activeKey ?? null,
          pageKind: shellPageKindFromHref(href, variant),
        });
        setProfileOpen(false);

        event.preventDefault();
        if (hasStalePrefetchedData) {
          refreshStaleServerData(router);
        }
        router.push(href);
      },
    };
  }

  return (
    <div className="reference-app-shell min-h-screen bg-[#f4f7fb] text-[#0f172a] dark:bg-background dark:text-foreground lg:grid lg:h-screen lg:overflow-hidden lg:grid-cols-[176px_minmax(0,1fr)]">
      <aside className="reference-sidebar sticky top-0 hidden h-screen min-w-0 flex-col bg-white/88 px-3 py-4 shadow-[1px_0_0_rgba(15,23,42,0.04)] backdrop-blur-xl dark:bg-[#0b1422]/96 dark:shadow-[1px_0_0_rgba(255,255,255,0.04)] lg:flex">
        <Link
          href={logoHref}
          {...routeLinkProps(logoHref, logoActiveKey)}
          className="reference-sidebar-logo-link flex items-center rounded-[10px] px-1.5 py-1 transition-colors hover:bg-[#eef4fb] dark:hover:bg-white/[0.06]"
        >
          <span className="reference-sidebar-logo-frame relative flex h-7 w-[132px] items-center overflow-hidden">
            <Image
              src={generisLogo}
              alt="Generis"
              className="reference-sidebar-logo-image h-auto w-full object-contain"
              priority
            />
          </span>
        </Link>
        <nav className="reference-sidebar-nav mt-6 space-y-0.5">
          {nav.map((item) => {
            const Icon = item.icon;
            const href = getNavHref(item, rememberedDates);

            return (
              <Link
                key={item.key}
                href={href}
                {...routeLinkProps(href, item.key, item.prefetch)}
                className={cn(
                  "reference-sidebar-nav-link flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[15px] font-semibold transition-colors",
                  visibleActive === item.key
                    ? "bg-[#eff6ff] text-[#2563eb] dark:bg-blue-400/10 dark:text-[#bfdbfe]"
                    : "text-[#52647a] hover:bg-[#eef4fb] hover:text-[#0f172a] dark:text-[#93a4b8] dark:hover:bg-white/[0.06] dark:hover:text-[#e2e8f0]",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span className="reference-sidebar-nav-label">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-col lg:h-screen lg:min-h-0">
        <header className="sticky top-0 z-20 shrink-0 bg-white/92 shadow-[0_1px_0_rgba(15,23,42,0.05)] backdrop-blur-xl dark:bg-[#0b1422]/94 dark:shadow-[0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex h-12 w-full items-center justify-between gap-3 px-[clamp(14px,1.7vw,26px)] lg:justify-end">
            <div className="flex h-full min-w-0 items-center gap-[clamp(16px,2.2vw,34px)] lg:hidden">
              <Link
                href={mobileLogoHref}
                {...routeLinkProps(mobileLogoHref, logoActiveKey)}
                className="flex shrink-0 items-center rounded-[10px] px-1.5 py-1 transition-colors hover:bg-[#eef4fb] dark:hover:bg-white/[0.06]"
              >
                <span className="relative flex h-7 w-[132px] items-center overflow-hidden">
                  <Image
                    src={generisLogo}
                    alt="Generis"
                    className="h-auto w-full object-contain"
                    priority
                  />
                </span>
              </Link>

              <nav className="hidden h-full items-center gap-1 md:flex">
                {nav.map((item) => {
                  const Icon = item.icon;
                  const href = getNavHref(item, rememberedDates);

                  return (
                    <Link
                      key={item.key}
                      href={href}
                      {...routeLinkProps(href, item.key, item.prefetch)}
                      className={cn(
                        "flex h-full items-center gap-2 border-b-[3px] px-4 text-sm font-semibold transition-colors",
                        visibleActive === item.key
                          ? "border-[#2563eb] text-[#2563eb] dark:border-[#60a5fa] dark:text-[#bfdbfe]"
                          : "border-transparent text-[#52647a] hover:text-[#0f172a] dark:text-[#93a4b8] dark:hover:text-[#e2e8f0]",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <div ref={profileMenuRef} className="relative flex items-center">
                {profileLoading ? (
                  <div
                    className="flex min-w-0 items-center gap-2 rounded-[10px] px-1.5 py-1"
                    aria-label="Loading profile"
                    aria-busy="true"
                  >
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="hidden h-4 w-28 rounded-[4px] sm:block" />
                    <Skeleton className="h-4 w-4 rounded-[4px]" />
                  </div>
                ) : (
                  <button
                    className="flex min-w-0 items-center gap-2 rounded-[10px] px-1.5 py-1 transition-colors hover:bg-[#eef4fb] dark:hover:bg-white/[0.06]"
                    onClick={() => {
                      setProfileOpen((open) => !open);
                    }}
                    aria-expanded={profileOpen}
                    aria-haspopup="menu"
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1d4ed8] bg-cover bg-center text-xs font-semibold text-white shadow-[0_8px_18px_rgba(29,78,216,0.22)] dark:bg-[#1d4ed8]"
                      style={
                        profileImage
                          ? { backgroundImage: `url("${profileImage}")` }
                          : undefined
                      }
                    >
                      {profileImage ? null : initials(displayName)}
                    </div>
                    <div className="hidden max-w-[200px] truncate text-sm font-semibold text-[#0f172a] dark:text-[#e2e8f0] sm:block">
                      {displayName}
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-[#64748b] transition-transform dark:text-[#94a3b8]",
                        profileOpen && "rotate-180",
                      )}
                    />
                  </button>
                )}
                {!profileLoading && profileOpen ? (
                  <div
                    className="absolute right-0 top-12 z-30 w-72 overflow-hidden rounded-[12px] border border-[#dbe3ee] bg-[#ffffff] p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.16)] dark:border-[#24354c] dark:bg-[#0f1b2a] dark:shadow-[0_18px_45px_rgba(0,0,0,0.42)]"
                    role="menu"
                  >
                    <div className="rounded-[8px] bg-[#f8fafc] px-3 py-2 dark:bg-[#0b1523]">
                      <div className="truncate text-sm font-semibold text-[#0f172a] dark:text-[#e2e8f0]">
                        {displayName}
                      </div>
                      <div className="text-xs text-[#64748b] dark:text-[#94a3b8]">
                        {userEmail ??
                          (userRole ||
                            (variant === "admin" ? "Reviewer" : "Employee"))}
                      </div>
                    </div>
                    <Link
                      href="/settings#account"
                      {...routeLinkProps("/settings#account", "settings")}
                      className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-sm text-[#334155] transition-colors hover:bg-[#f1f5f9] dark:text-[#d7e0ec] dark:hover:bg-[#17263a]"
                    >
                      <CircleUser className="h-4 w-4" />
                      Account settings
                    </Link>
                    {mustChangePassword ? (
                      <Link
                        href="/change-password"
                        {...routeLinkProps("/change-password")}
                        className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-sm text-[#334155] transition-colors hover:bg-[#f1f5f9] dark:text-[#d7e0ec] dark:hover:bg-[#17263a]"
                      >
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
          </div>
          <nav className="flex h-11 items-center gap-2 overflow-x-auto px-[clamp(14px,1.7vw,26px)] shadow-[0_-1px_0_rgba(15,23,42,0.04)] dark:shadow-[0_-1px_0_rgba(255,255,255,0.04)] md:hidden">
            {nav.map((item) => {
              const Icon = item.icon;
              const href = getNavHref(item, rememberedDates);

              return (
                <Link
                  key={item.key}
                  href={href}
                  {...routeLinkProps(href, item.key, item.prefetch)}
                  className={cn(
                    "flex h-full shrink-0 items-center gap-2 border-b-[3px] px-2 text-sm font-semibold transition-colors",
                    visibleActive === item.key
                      ? "border-[#2563eb] text-[#2563eb] dark:border-[#60a5fa] dark:text-[#93c5fd]"
                      : "border-transparent text-[#475569] hover:text-[#0f172a] dark:text-[#94a3b8] dark:hover:text-[#e2e8f0]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <div
          ref={contentScrollRef}
          aria-busy={navigationPending}
          className="reference-content-scroll min-w-0 flex-1 lg:min-h-0 lg:overflow-y-auto"
        >
          {pendingPageKind ? (
            <PageLoadingSkeleton kind={pendingPageKind} />
          ) : (
            children
          )}
        </div>
      </div>
      {navigationPending ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-0.5 overflow-hidden"
        >
          <div className="reference-route-progress-bar h-full w-1/3 rounded-r-full bg-[#2563eb] shadow-[0_0_14px_rgba(37,99,235,0.45)] dark:bg-[#60a5fa]" />
        </div>
      ) : null}
    </div>
  );
}

function rolesFromShell(
  userRoles: string[] | null | undefined,
  variant: ShellVariant,
) {
  const fallbackRoles =
    variant === "admin"
      ? ["ADMIN"]
      : variant === "reviewer"
        ? ["REVIEWER"]
        : ["EMPLOYEE"];
  const roles = userRoles?.length ? userRoles : fallbackRoles;

  return new Set(roles);
}

function hasShellRole(
  userRoles: string[] | null | undefined,
  variant: ShellVariant,
  role: "EMPLOYEE" | "REVIEWER" | "ADMIN",
) {
  return rolesFromShell(userRoles, variant).has(role);
}

function navForRoles(
  userRoles: string[] | null | undefined,
  variant: ShellVariant,
) {
  const roles = rolesFromShell(userRoles, variant);
  const nav: NavItem[] = [];

  if (roles.has("EMPLOYEE")) {
    nav.push(...employeeNav.filter((item) => item.key !== "settings"));
  }

  if (roles.has("REVIEWER") || roles.has("ADMIN")) {
    nav.push(...reviewerNav.filter((item) => item.key !== "settings"));
  }

  if (roles.has("ADMIN")) {
    nav.push(...adminNav.filter((item) => item.key === "admin"));
  }

  nav.push(employeeNav.find((item) => item.key === "settings")!);

  return nav;
}

function getLogoHref(
  userRoles: string[] | null | undefined,
  variant: ShellVariant,
  lastReviewDate?: string | null,
) {
  if (!hasShellRole(userRoles, variant, "EMPLOYEE")) {
    return lastReviewDate ? `/review?date=${lastReviewDate}` : "/review";
  }

  return "/";
}

function getNavHref(item: NavItem, dates: RememberedDates) {
  if (item.key === "report" && dates.lastReportDate) {
    return `/?date=${dates.lastReportDate}`;
  }

  if (item.key === "review" && dates.lastReviewDate) {
    return `/review?date=${dates.lastReviewDate}`;
  }

  return item.href;
}

function persistRememberedDate(
  dateStorageKey: string,
  savedOnStorageKey: string,
  date: string,
) {
  window.localStorage.setItem(dateStorageKey, clampReportDateToToday(date));
  window.localStorage.setItem(savedOnStorageKey, todayDateString());
}

function clearRememberedDate(
  dateStorageKey: string,
  savedOnStorageKey: string,
) {
  window.localStorage.removeItem(dateStorageKey);
  window.localStorage.removeItem(savedOnStorageKey);
}

function resetContentScroll(element: HTMLDivElement | null) {
  element?.scrollTo({ left: 0, top: 0 });
}

export function activeNavKey(pathname: string | null): NavKey {
  const path = pathname || "/";

  if (path === "/" || path === "") {
    return "report";
  }

  if (path.startsWith("/reports")) {
    return "reports";
  }

  if (path.startsWith("/review")) {
    return "review";
  }

  if (path.startsWith("/admin")) {
    return "admin";
  }

  if (path.startsWith("/settings") || path.startsWith("/account")) {
    return "settings";
  }

  return "report";
}

export function shellPageKindFromHref(
  href: string,
  variant: ShellVariant = "employee",
) {
  const path = href.split("#")[0].split("?")[0] || "/";

  if (
    path === "/" ||
    path.startsWith("/reports") ||
    path.startsWith("/review") ||
    path.startsWith("/admin") ||
    path.startsWith("/settings") ||
    path.startsWith("/account")
  ) {
    return loadingKindFromHref(href, variant);
  }

  return null;
}

export function resolveLastReportDate(
  pathname: string | null,
  routeReportDate?: string | null,
  storedReportDate?: string | null,
  storedReportDateSavedOn?: string | null,
) {
  if ((pathname || "/") === "/" && routeReportDate) {
    return clampReportDateToToday(routeReportDate);
  }

  return resolveFreshRememberedDate(storedReportDate, storedReportDateSavedOn);
}

export function resolveLastReviewDate(
  pathname: string | null,
  routeReviewDate?: string | null,
  storedReviewDate?: string | null,
  storedReviewDateSavedOn?: string | null,
) {
  if ((pathname || "/") === "/review" && routeReviewDate) {
    return clampReportDateToToday(routeReviewDate);
  }

  return resolveFreshRememberedDate(storedReviewDate, storedReviewDateSavedOn);
}

function resolveFreshRememberedDate(
  storedDate?: string | null,
  storedDateSavedOn?: string | null,
) {
  if (!storedDate || storedDateSavedOn !== todayDateString()) {
    return null;
  }

  return clampReportDateToToday(storedDate);
}

export function ReferencePanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("reference-card min-w-0", className)}>
      {children}
    </section>
  );
}

export function ReferenceBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "green" | "orange" | "red" | "blue" | "neutral";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    green:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
    orange:
      "bg-orange-50 text-orange-700 dark:bg-orange-400/10 dark:text-orange-300",
    red: "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
    neutral:
      "bg-[#f4f7fb] text-[#52647a] dark:bg-white/[0.045] dark:text-[#b5c2d3]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-[7px] px-2.5 py-1 text-xs font-semibold leading-none",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyReferenceState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-24 items-center justify-center rounded-[10px] border border-dashed border-[#cbd5e1] bg-[#f8fafc]/80 px-4 text-center text-sm text-[#64748b] dark:border-[#2b3c54] dark:bg-[#0b1523]/80 dark:text-muted-foreground">
      {children}
    </div>
  );
}
