"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type { ElementType, MouseEvent, ReactNode } from "react";
import {
  BarChart3,
  Bug,
  CalendarDays,
  ChevronDown,
  CircleUser,
  ClipboardList,
  History,
  KeyRound,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
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
  hasStaleServerData,
  markServerDataFresh,
  serverDataFreshEvent,
  serverDataStaleEvent,
} from "@/lib/client-cache-invalidation";
import { anchoredFixedPlacement } from "@/lib/anchored-position";
import { clampReportDateToToday, todayDateString } from "@/lib/dates";
import { startClientTiming } from "@/lib/performance";
import { cn, initials } from "@/lib/utils";
import generisLogo from "@/images/Generis_logo.png";

type ShellVariant = "employee" | "reviewer" | "admin";

type NavKey =
  | "report"
  | "reports"
  | "calendar"
  | "review"
  | "admin"
  | "bugs"
  | "settings";

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
  href: string;
  pageKind: PageLoadingKind | null;
  startedAt: number;
};

const reportDateStorageKey = "generis.lastReportDate";
const reportDateSavedOnStorageKey = "generis.lastReportDateSavedOn";
const reviewDateStorageKey = "generis.lastReviewDate";
const reviewDateSavedOnStorageKey = "generis.lastReviewDateSavedOn";
const defaultAdminHref = "/admin/team";

const employeeNav: NavItem[] = [
  {
    href: "/",
    label: "Daily update",
    icon: ClipboardList,
    key: "report",
    prefetch: "eager",
  },
  {
    href: "/reports",
    label: "My reports",
    icon: History,
    key: "reports",
    prefetch: "eager",
  },
  {
    href: "/calendar",
    label: "Locations",
    icon: CalendarDays,
    key: "calendar",
    prefetch: "intent",
  },
  {
    href: "/bugs",
    label: "Bug reports",
    icon: Bug,
    key: "bugs",
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

const reviewerNav: NavItem[] = [
  {
    href: "/review",
    label: "Team review",
    icon: BarChart3,
    key: "review",
    prefetch: "eager",
  },
  {
    href: "/calendar",
    label: "Locations",
    icon: CalendarDays,
    key: "calendar",
    prefetch: "intent",
  },
  {
    href: "/bugs",
    label: "Bug reports",
    icon: Bug,
    key: "bugs",
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

const adminNav: NavItem[] = [
  {
    href: defaultAdminHref,
    label: "Admin",
    icon: Users,
    key: "admin",
    prefetch: "intent",
  },
  {
    href: "/calendar",
    label: "Locations",
    icon: CalendarDays,
    key: "calendar",
    prefetch: "intent",
  },
  {
    href: "/bugs",
    label: "Bug reports",
    icon: Bug,
    key: "bugs",
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
  const nav = useMemo(
    () => navForRoles(userRoles, variant),
    [userRoles, variant],
  );
  const active = activeNavKey(pathname);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileMenuPosition, setProfileMenuPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [lastReportDate, setLastReportDate] = useState<string | null>(null);
  const [lastReviewDate, setLastReviewDate] = useState<string | null>(null);
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);
  const [serverDataVersion, setServerDataVersion] = useState(0);
  const [freshServerDataVersion, setFreshServerDataVersion] = useState(0);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const mobileNavButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileNavRef = useRef<HTMLDivElement | null>(null);
  const prefetchedHrefsRef = useRef<Set<string>>(new Set());
  const refreshAfterNavigationHrefRef = useRef<string | null>(null);
  const routeTimingRef = useRef<ReturnType<typeof startClientTiming> | null>(
    null,
  );
  const committedChildrenRef = useRef(children);
  const searchParamString = searchParams?.toString() ?? "";
  const currentHref = `${pathname}${searchParamString ? `?${searchParamString}` : ""}`;
  const routeDateParam = searchParams?.get("date") ?? null;
  const displayedNav = useMemo(
    () => (profileLoading ? [] : nav),
    [nav, profileLoading],
  );
  const rememberedDates = useMemo(
    () => ({ lastReportDate, lastReviewDate }),
    [lastReportDate, lastReviewDate],
  );
  const logoHref = getLogoHref(userRoles, variant, lastReviewDate);
  const mobileLogoHref = logoHref;
  const logoActiveKey = getLogoActiveKey(userRoles, variant);
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
    refs: [profileMenuRef, profileMenuPanelRef],
    onDismiss: () => setProfileOpen(false),
  });

  useDismissableLayer({
    open: mobileNavOpen,
    refs: [mobileNavButtonRef, mobileNavRef],
    onDismiss: () => setMobileNavOpen(false),
  });

  const updateProfileMenuPosition = useCallback(() => {
    if (typeof window === "undefined" || !profileMenuRef.current) {
      return;
    }

    const placement = anchoredFixedPlacement({
      anchorRect: profileMenuRef.current.getBoundingClientRect(),
      preferredWidth: 288,
      preferredMaxHeight: 320,
      minHeight: 120,
      flipHeight: 220,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      viewportPadding: 8,
      gap: 6,
      align: "end",
    });

    setProfileMenuPosition({
      left: placement.left,
      top: placement.top,
      width: placement.width,
      maxHeight: placement.maxHeight,
    });
  }, []);

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
    if (!profileOpen) {
      setProfileMenuPosition(null);
      return undefined;
    }

    window.addEventListener("resize", updateProfileMenuPosition);
    window.addEventListener("scroll", updateProfileMenuPosition, true);
    updateProfileMenuPosition();

    return () => {
      window.removeEventListener("resize", updateProfileMenuPosition);
      window.removeEventListener("scroll", updateProfileMenuPosition, true);
    };
  }, [profileOpen, updateProfileMenuPosition]);

  const refreshDestinationAfterStaleNavigation = useCallback(() => {
    const refreshHref = refreshAfterNavigationHrefRef.current;

    if (!refreshHref || currentHref !== refreshHref) {
      return;
    }

    refreshAfterNavigationHrefRef.current = null;
    router.refresh();
    markServerDataFresh();
  }, [currentHref, router]);

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
    if (children === committedChildrenRef.current) {
      return;
    }

    committedChildrenRef.current = children;

    if (!pendingNavigation) {
      return;
    }

    setPendingNavigation(null);
    resetContentScroll(contentScrollRef.current);
    refreshDestinationAfterStaleNavigation();
    routeTimingRef.current?.({ status: "committed" });
    routeTimingRef.current = null;
  }, [children, pendingNavigation, refreshDestinationAfterStaleNavigation]);

  useEffect(() => {
    const pendingHrefWithoutHash =
      pendingNavigation?.href.split("#")[0] || null;

    if (!pendingNavigation || currentHref !== pendingHrefWithoutHash) {
      return;
    }

    const minimumSkeletonMs = 180;
    const elapsedMs = Date.now() - pendingNavigation.startedAt;
    const timeoutId = window.setTimeout(
      () => {
        setPendingNavigation(null);
        resetContentScroll(contentScrollRef.current);
        refreshDestinationAfterStaleNavigation();
        routeTimingRef.current?.({ status: "committed" });
        routeTimingRef.current = null;
      },
      Math.max(0, minimumSkeletonMs - elapsedMs),
    );

    return () => window.clearTimeout(timeoutId);
  }, [currentHref, pendingNavigation, refreshDestinationAfterStaleNavigation]);

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
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const desktopMediaQuery = window.matchMedia("(min-width: 1280px)");

    function closeDrawerOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) {
        setMobileNavOpen(false);
      }
    }

    if (desktopMediaQuery.matches) {
      setMobileNavOpen(false);
    }

    desktopMediaQuery.addEventListener("change", closeDrawerOnDesktop);

    return () => {
      desktopMediaQuery.removeEventListener("change", closeDrawerOnDesktop);
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
      ...displayedNav
        .filter((item) => item.prefetch === "eager")
        .map((item) => getNavHref(item, rememberedDates, currentHref)),
    ];

    hrefs.forEach((href) => {
      if (href !== currentHref) {
        prefetchRoute(href);
      }
    });
  }, [
    currentHref,
    displayedNav,
    hasStalePrefetchedData,
    logoHref,
    rememberedDates,
    mobileLogoHref,
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
        const hrefWithoutHash = href.split("#")[0] || "/";

        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          hrefWithoutHash === currentHref
        ) {
          setProfileOpen(false);
          setMobileNavOpen(false);
          return;
        }

        if (hashOnlyCurrentPage) {
          setProfileOpen(false);
          setMobileNavOpen(false);
          return;
        }

        const pageKind = shellPageKindFromHref(href, variant);
        const pendingActiveKey = activeKey ?? activeNavKey(prefetchHref);

        event.preventDefault();
        resetContentScroll(contentScrollRef.current);
        routeTimingRef.current = startClientTiming("shell:route-navigation", {
          from: currentHref,
          to: href,
        });

        flushSync(() => {
          setPendingNavigation({
            activeKey: pendingActiveKey,
            href,
            pageKind,
            startedAt: Date.now(),
          });
          setProfileOpen(false);
          setMobileNavOpen(false);
        });

        if (hasStaleServerData()) {
          refreshAfterNavigationHrefRef.current = hrefWithoutHash;
        }
        router.push(href);
      },
    };
  }

  const mobileNavOverlay = mobileNavOpen ? (
    <div
      className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] xl:hidden"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setMobileNavOpen(false);
        }
      }}
    >
      <aside
        ref={mobileNavRef}
        className="flex h-full w-[min(13.5rem,calc(100vw-5.5rem))] flex-col border-r border-border bg-card shadow-[20px_0_60px_rgba(15,23,42,0.18)] dark:shadow-[20px_0_60px_rgba(0,0,0,0.38)]"
        aria-label="Mobile navigation"
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3.5">
          <Link
            href={mobileLogoHref}
            {...routeLinkProps(mobileLogoHref, logoActiveKey)}
            className="flex min-w-0 flex-1 items-center rounded-lg py-1 transition-colors hover:opacity-80"
            aria-label="Generis home"
          >
            <span className="relative flex h-7 w-[132px] min-w-0 shrink items-center overflow-hidden">
              <Image
                src={generisLogo}
                alt="Generis"
                className="h-auto w-full object-contain"
                priority
              />
            </span>
          </Link>
          <button
            type="button"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground ring-1 ring-transparent transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/[0.08] dark:hover:text-foreground"
            aria-label="Close navigation menu"
            onClick={() => {
              setMobileNavOpen(false);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-2.5 py-2 [scrollbar-gutter:stable]"
          role="menu"
        >
          {displayedNav.map((item) => {
            const Icon = item.icon;
            const href = getNavHref(item, rememberedDates, currentHref);
            const activeItem = visibleActive === item.key;

            return (
              <Link
                key={item.key}
                href={href}
                {...routeLinkProps(href, item.key, item.prefetch)}
                role="menuitem"
                className={cn(
                  "flex min-h-10 min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm leading-5 transition-colors",
                  activeItem
                    ? "bg-primary-subtle font-semibold text-primary dark:text-primary-subtle-foreground"
                    : "font-medium text-foreground-muted hover:bg-muted/60 hover:text-foreground dark:text-muted-foreground dark:hover:bg-white/[0.06] dark:hover:text-foreground",
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  ) : null;

  return (
    <div className="reference-app-shell flex h-[100dvh] min-h-0 overflow-hidden bg-surface-subtle text-foreground dark:bg-background">
      <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-border bg-card/96 xl:flex">
        <div className="flex h-12 shrink-0 items-center border-b border-border px-5">
          <Link
            href={logoHref}
            {...routeLinkProps(logoHref, logoActiveKey)}
            className="flex items-center rounded-lg px-1.5 py-1 transition-colors hover:bg-surface-subtle dark:hover:bg-white/[0.06]"
          >
            <span className="relative flex h-7 w-[136px] items-center overflow-hidden">
              <Image
                src={generisLogo}
                alt="Generis"
                className="h-auto w-full object-contain"
                priority
              />
            </span>
          </Link>
        </div>
        <nav
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-3"
          aria-label="Primary navigation"
        >
          {displayedNav.map((item) => {
            const Icon = item.icon;
            const href = getNavHref(item, rememberedDates, currentHref);
            const activeItem = visibleActive === item.key;

            return (
              <Link
                key={item.key}
                href={href}
                {...routeLinkProps(href, item.key, item.prefetch)}
                className={cn(
                  "flex min-h-10 min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm leading-5 transition-colors",
                  activeItem
                    ? "bg-primary-subtle font-semibold text-primary shadow-surface-sm dark:text-primary-subtle-foreground"
                    : "font-medium text-foreground-muted hover:bg-muted/60 hover:text-foreground dark:text-muted-foreground dark:hover:bg-white/[0.06] dark:hover:text-foreground",
                )}
                aria-current={activeItem ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    activeItem
                      ? "text-primary dark:text-primary-subtle-foreground"
                      : "text-muted-foreground",
                  )}
                />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 shrink-0 border-b border-border bg-card/94 backdrop-blur-xl">
          <div className="flex h-12 w-full items-center justify-between gap-3 px-[clamp(14px,1.8vw,28px)]">
            <div className="flex min-w-0 flex-1 items-center">
              <button
                ref={mobileNavButtonRef}
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card text-sm font-semibold text-foreground ring-1 ring-border transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-white/[0.06] dark:ring-white/[0.08] dark:hover:bg-white/[0.1] xl:hidden"
                aria-label={
                  mobileNavOpen
                    ? "Close navigation menu"
                    : "Open navigation menu"
                }
                aria-expanded={mobileNavOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setProfileOpen(false);
                  setMobileNavOpen((open) => !open);
                }}
              >
                {mobileNavOpen ? (
                  <X className="h-4 w-4 shrink-0" />
                ) : (
                  <Menu className="h-4 w-4 shrink-0" />
                )}
              </button>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <ThemeToggle />
              <div ref={profileMenuRef} className="relative flex items-center">
                {profileLoading ? (
                  <div
                    className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-0.5"
                    aria-label="Loading profile"
                    aria-busy="true"
                  >
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="hidden h-4 w-28 rounded-sm sm:block" />
                    <Skeleton className="h-4 w-4 rounded-sm" />
                  </div>
                ) : (
                  <button
                    className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-0.5 transition-colors hover:bg-surface-subtle dark:hover:bg-white/[0.06] sm:px-1.5"
                    onClick={() => {
                      if (!profileOpen) {
                        updateProfileMenuPosition();
                      }
                      setProfileOpen((open) => !open);
                    }}
                    aria-expanded={profileOpen}
                    aria-haspopup="menu"
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground bg-cover bg-center text-xs font-semibold text-white shadow-[0_6px_14px_rgba(15,23,42,0.14)] dark:bg-primary"
                      style={
                        profileImage
                          ? { backgroundImage: `url("${profileImage}")` }
                          : undefined
                      }
                    >
                      {profileImage ? null : initials(displayName)}
                    </div>
                    <div className="hidden min-w-0 sm:block">
                      <div className="max-w-[180px] truncate text-sm font-semibold leading-4 text-foreground">
                        {displayName}
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 text-muted-foreground transition-transform",
                        profileOpen && "rotate-180",
                      )}
                    />
                  </button>
                )}
                {!profileLoading && profileOpen && typeof document !== "undefined"
                  ? createPortal(
                      <div
                        ref={profileMenuPanelRef}
                        className="fixed z-[1000] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-1.5 shadow-surface-strong [scrollbar-gutter:stable]"
                        role="menu"
                        aria-label="Profile menu"
                        style={{
                          left: profileMenuPosition?.left ?? 0,
                          top: profileMenuPosition?.top ?? 0,
                          width: profileMenuPosition?.width,
                          maxHeight: profileMenuPosition?.maxHeight,
                          visibility: profileMenuPosition
                            ? "visible"
                            : "hidden",
                        }}
                      >
                        <div className="rounded-lg bg-surface-subtle px-3 py-2 dark:bg-background">
                          <div className="truncate text-sm font-semibold text-foreground">
                            {displayName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {userEmail ??
                              (displayName ? "Signed in" : "Account")}
                          </div>
                        </div>
                        <Link
                          href="/settings#account"
                          {...routeLinkProps("/settings#account", "settings")}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground-muted transition-colors hover:bg-surface-subtle dark:text-foreground dark:hover:bg-white/[0.05]"
                        >
                          <CircleUser className="h-4 w-4" />
                          Account settings
                        </Link>
                        {mustChangePassword ? (
                          <Link
                            href="/change-password"
                            {...routeLinkProps("/change-password")}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground-muted transition-colors hover:bg-surface-subtle dark:text-foreground dark:hover:bg-white/[0.05]"
                          >
                            <KeyRound className="h-4 w-4" />
                            Change password
                          </Link>
                        ) : null}
                        <button
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground-muted transition-colors hover:bg-surface-subtle dark:text-foreground dark:hover:bg-white/[0.05]"
                          onClick={() => {
                            signOut({ callbackUrl: "/login" });
                          }}
                        >
                          <LogOut className="h-4 w-4" />
                          Sign out
                        </button>
                      </div>,
                      document.body,
                    )
                  : null}
              </div>
            </div>
          </div>
        </header>
        {mobileNavOverlay}
        <div
          ref={contentScrollRef}
          aria-busy={navigationPending}
          className="reference-content-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
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
          <div className="reference-route-progress-bar h-full w-1/3 rounded-r-full bg-primary shadow-[0_0_14px_rgba(37,99,235,0.45)]" />
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
  const pushUnique = (items: NavItem[]) => {
    for (const item of items) {
      if (!nav.some((existing) => existing.key === item.key)) {
        nav.push(item);
      }
    }
  };

  if (roles.has("EMPLOYEE")) {
    pushUnique(
      employeeNav.filter(
        (item) => item.key !== "settings" && item.key !== "bugs",
      ),
    );
  }

  if (roles.has("REVIEWER")) {
    pushUnique(
      reviewerNav.filter(
        (item) => item.key !== "settings" && item.key !== "bugs",
      ),
    );
  }

  if (roles.has("ADMIN")) {
    if (!roles.has("REVIEWER")) {
      nav.push(reviewerNav.find((item) => item.key === "review")!);
    }

    pushUnique(adminNav.filter((item) => item.key === "admin"));
    pushUnique(adminNav.filter((item) => item.key === "calendar"));
  }

  pushUnique([employeeNav.find((item) => item.key === "bugs")!]);
  pushUnique([employeeNav.find((item) => item.key === "settings")!]);

  return nav;
}

function getLogoHref(
  userRoles: string[] | null | undefined,
  variant: ShellVariant,
  lastReviewDate?: string | null,
) {
  if (hasShellRole(userRoles, variant, "EMPLOYEE")) {
    return "/";
  }

  if (hasShellRole(userRoles, variant, "REVIEWER")) {
    return lastReviewDate ? `/review?date=${lastReviewDate}` : "/review";
  }

  if (hasShellRole(userRoles, variant, "ADMIN")) {
    return defaultAdminHref;
  }

  return "/settings";
}

function getLogoActiveKey(
  userRoles: string[] | null | undefined,
  variant: ShellVariant,
): NavKey {
  if (hasShellRole(userRoles, variant, "EMPLOYEE")) {
    return "report";
  }

  if (hasShellRole(userRoles, variant, "REVIEWER")) {
    return "review";
  }

  if (hasShellRole(userRoles, variant, "ADMIN")) {
    return "admin";
  }

  return "settings";
}

function getNavHref(
  item: NavItem,
  dates: RememberedDates,
  currentHref?: string | null,
) {
  if (item.key === "report" && dates.lastReportDate) {
    return `/?date=${dates.lastReportDate}`;
  }

  if (item.key === "review" && dates.lastReviewDate) {
    return `/review?date=${dates.lastReviewDate}`;
  }

  if (item.key === "bugs") {
    return bugReportHrefForSource(currentHref);
  }

  return item.href;
}

function bugReportHrefForSource(currentHref?: string | null) {
  if (!currentHref || currentHref.startsWith("/bugs")) {
    return "/bugs";
  }

  return `/bugs?from=${encodeURIComponent(currentHref.slice(0, 500))}`;
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

  if (path.startsWith("/calendar")) {
    return "calendar";
  }

  if (path.startsWith("/review")) {
    return "review";
  }

  if (path.startsWith("/admin")) {
    return "admin";
  }

  if (path.startsWith("/bugs")) {
    return "bugs";
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
    path.startsWith("/calendar") ||
    path.startsWith("/review") ||
    path.startsWith("/admin") ||
    path.startsWith("/bugs") ||
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
      "bg-surface-subtle text-muted-foreground dark:bg-white/[0.045] dark:text-muted-foreground",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold leading-none",
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
    <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-subtle/80 px-4 text-center text-sm text-muted-foreground dark:bg-background/80">
      {children}
    </div>
  );
}
