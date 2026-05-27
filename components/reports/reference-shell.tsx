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
  ChevronLeft,
  ChevronRight,
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
import { clampReportDateToToday } from "@/lib/dates";
import { cn, initials } from "@/lib/utils";
import generisLogo from "@/images/Generis_logo.png";

type NavKey = "report" | "reports" | "review" | "employees" | "settings";

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
    label: "Employees",
    icon: Users,
    key: "employees",
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
  mustChangePassword,
  profileLoading = false,
}: {
  children: ReactNode;
  variant: "employee" | "admin";
  displayName: string;
  userEmail?: string | null;
  profileImage?: string | null;
  userRole: string;
  mustChangePassword: boolean;
  profileLoading?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nav = variant === "admin" ? adminNav : employeeNav;
  const active = activeNavKey(pathname);
  const [profileOpen, setProfileOpen] = useState(false);
  const [lastReportDate, setLastReportDate] = useState<string | null>(null);
  const [lastReviewDate, setLastReviewDate] = useState<string | null>(null);
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);
  const [serverDataVersion, setServerDataVersion] = useState(0);
  const [freshServerDataVersion, setFreshServerDataVersion] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const prefetchedHrefsRef = useRef<Set<string>>(new Set());
  const searchParamString = searchParams?.toString() ?? "";
  const currentHref = `${pathname}${searchParamString ? `?${searchParamString}` : ""}`;
  const routeDateParam = searchParams?.get("date") ?? null;
  const rememberedDates = useMemo(
    () => ({ lastReportDate, lastReviewDate }),
    [lastReportDate, lastReviewDate],
  );
  const logoHref = getLogoHref(variant, lastReviewDate);
  const mobileLogoHref = logoHref;
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
    const storedCollapsed =
      window.localStorage.getItem("generis.sidebarCollapsed") === "true";
    document.documentElement.dataset.sidebarCollapsed = storedCollapsed
      ? "true"
      : "false";
    setSidebarCollapsed(storedCollapsed);
  }, []);

  useEffect(() => {
    if (variant !== "employee") {
      return;
    }

    const routeReportDate = pathname === "/" ? routeDateParam : null;
    const storedDate = window.localStorage.getItem("generis.lastReportDate");
    const nextReportDate = resolveLastReportDate(
      pathname,
      routeReportDate,
      storedDate,
    );

    if (routeReportDate) {
      window.localStorage.setItem(
        "generis.lastReportDate",
        clampReportDateToToday(routeReportDate),
      );
    }

    setLastReportDate(nextReportDate);
  }, [pathname, routeDateParam, variant]);

  useEffect(() => {
    if (variant !== "admin") {
      return;
    }

    const routeReviewDate = pathname === "/review" ? routeDateParam : null;
    const storedDate = window.localStorage.getItem("generis.lastReviewDate");
    const nextReviewDate = resolveLastReviewDate(
      pathname,
      routeReviewDate,
      storedDate,
    );

    if (routeReviewDate) {
      window.localStorage.setItem(
        "generis.lastReviewDate",
        clampReportDateToToday(routeReviewDate),
      );
    }

    setLastReviewDate(nextReviewDate);
  }, [pathname, routeDateParam, variant]);

  useEffect(() => {
    setPendingNavigation(null);
    resetContentScroll(contentScrollRef.current);
  }, [active, pathname, searchParamString]);

  useEffect(() => {
    if (!pendingNavigation) {
      return;
    }

    const fallbackTimer = window.setTimeout(() => {
      setPendingNavigation(null);
    }, 10000);

    return () => {
      window.clearTimeout(fallbackTimer);
    };
  }, [pendingNavigation]);

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
        setPendingNavigation({
          activeKey: activeKey ?? null,
          pageKind: shellPageKindFromHref(href, variant),
        });
        setProfileOpen(false);

        if (hasStalePrefetchedData) {
          event.preventDefault();
          refreshStaleServerData(router);
          router.push(href);
        }
      },
    };
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((collapsed) => {
      const nextCollapsed = !collapsed;
      window.localStorage.setItem(
        "generis.sidebarCollapsed",
        String(nextCollapsed),
      );
      document.documentElement.dataset.sidebarCollapsed = nextCollapsed
        ? "true"
        : "false";
      return nextCollapsed;
    });
  }

  return (
    <div
      className={cn(
        "reference-app-shell min-h-screen bg-[#f4f7fb] text-[#0f172a] dark:bg-background dark:text-foreground lg:grid lg:h-screen lg:overflow-hidden lg:transition-[grid-template-columns] lg:duration-200",
        sidebarCollapsed
          ? "lg:grid-cols-[64px_minmax(0,1fr)]"
          : "lg:grid-cols-[176px_minmax(0,1fr)]",
      )}
    >
      <aside
        className={cn(
          "reference-sidebar sticky top-0 hidden h-screen min-w-0 flex-col bg-white/88 px-3 py-4 shadow-[1px_0_0_rgba(15,23,42,0.04)] backdrop-blur-xl dark:bg-[#0b1422]/96 dark:shadow-[1px_0_0_rgba(255,255,255,0.04)] lg:flex",
          sidebarCollapsed && "items-center px-2.5",
        )}
      >
        <button
          type="button"
          className="absolute -right-3 top-1/2 z-30 flex h-14 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-[#dfe7f1] bg-[#f8fafc] text-[#64748b] shadow-[0_6px_14px_rgba(15,23,42,0.08)] transition-colors hover:border-[#cbd5e1] hover:bg-[#eef4fb] hover:text-[#2563eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:border-[#24354c] dark:bg-[#0b1422] dark:text-[#94a3b8] dark:shadow-[0_10px_20px_rgba(0,0,0,0.24)] dark:hover:bg-[#132239] dark:hover:text-[#bfdbfe]"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggleSidebarCollapsed}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
        {sidebarCollapsed ? (
          <Link
            href={logoHref}
            {...routeLinkProps(
              logoHref,
              variant === "admin" ? "review" : "report",
            )}
            className="reference-sidebar-logo-link flex h-9 w-10 items-center justify-center overflow-hidden rounded-[9px] transition-colors hover:bg-[#eef4fb] dark:hover:bg-white/[0.06]"
            aria-label="Generis home"
            title="Generis home"
          >
            <span className="reference-sidebar-logo-frame relative flex h-7 w-10 items-center overflow-hidden">
              <Image
                src={generisLogo}
                alt="Generis"
                className="reference-sidebar-logo-image h-auto w-[132px] max-w-none object-left object-contain"
                priority
              />
            </span>
          </Link>
        ) : (
          <Link
            href={logoHref}
            {...routeLinkProps(
              logoHref,
              variant === "admin" ? "review" : "report",
            )}
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
        )}
        <nav
          className={cn(
            "reference-sidebar-nav mt-6 space-y-0.5",
            sidebarCollapsed && "w-full",
          )}
        >
          {nav.map((item) => {
            const Icon = item.icon;
            const href = getNavHref(item, rememberedDates);

            return (
              <Link
                key={item.key}
                href={href}
                {...routeLinkProps(href, item.key, item.prefetch)}
                aria-label={sidebarCollapsed ? item.label : undefined}
                title={sidebarCollapsed ? item.label : undefined}
                className={cn(
                  "reference-sidebar-nav-link flex items-center rounded-[9px] text-[15px] font-semibold transition-colors",
                  sidebarCollapsed
                    ? "h-11 justify-center px-0"
                    : "gap-3 px-3 py-2.5",
                  visibleActive === item.key
                    ? "bg-[#eff6ff] text-[#2563eb] dark:bg-blue-400/10 dark:text-[#bfdbfe]"
                    : "text-[#52647a] hover:bg-[#eef4fb] hover:text-[#0f172a] dark:text-[#93a4b8] dark:hover:bg-white/[0.06] dark:hover:text-[#e2e8f0]",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {sidebarCollapsed ? null : (
                  <span className="reference-sidebar-nav-label">
                    {item.label}
                  </span>
                )}
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
                {...routeLinkProps(
                  mobileLogoHref,
                  variant === "admin" ? "review" : "report",
                )}
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

function getLogoHref(
  variant: "employee" | "admin",
  lastReviewDate?: string | null,
) {
  if (variant === "admin") {
    return lastReviewDate
      ? `/review?date=${clampReportDateToToday(lastReviewDate)}`
      : "/review";
  }

  return "/";
}

function getNavHref(item: NavItem, dates: RememberedDates) {
  if (item.key === "report" && dates.lastReportDate) {
    return `/?date=${clampReportDateToToday(dates.lastReportDate)}`;
  }

  if (item.key === "review" && dates.lastReviewDate) {
    return `/review?date=${clampReportDateToToday(dates.lastReviewDate)}`;
  }

  return item.href;
}

function resetContentScroll(element: HTMLDivElement | null) {
  element?.scrollTo({ left: 0, top: 0 });
}

export function activeNavKey(pathname: string | null): NavKey {
  const path = pathname || "/";

  if (path === "/" || path === "") {
    return "report";
  }

  if (path.startsWith("/reports") || path.startsWith("/history")) {
    return "reports";
  }

  if (path.startsWith("/review") || path.startsWith("/coo")) {
    return "review";
  }

  if (path.startsWith("/admin")) {
    return "employees";
  }

  if (path.startsWith("/settings") || path.startsWith("/account")) {
    return "settings";
  }

  return "report";
}

export function shellPageKindFromHref(
  href: string,
  variant: "employee" | "admin" = "employee",
) {
  const path = href.split("#")[0].split("?")[0] || "/";

  if (
    path === "/" ||
    path.startsWith("/reports") ||
    path.startsWith("/history") ||
    path.startsWith("/review") ||
    path.startsWith("/coo") ||
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
) {
  if ((pathname || "/") === "/" && routeReportDate) {
    return clampReportDateToToday(routeReportDate);
  }

  return storedReportDate ? clampReportDateToToday(storedReportDate) : null;
}

export function resolveLastReviewDate(
  pathname: string | null,
  routeReviewDate?: string | null,
  storedReviewDate?: string | null,
) {
  if ((pathname || "/") === "/review" && routeReviewDate) {
    return clampReportDateToToday(routeReviewDate);
  }

  return storedReviewDate ? clampReportDateToToday(storedReviewDate) : null;
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
