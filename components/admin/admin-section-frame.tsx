"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Building2, FileText, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type AdminSectionId = "team" | "departments" | "reports";

type AdminSection = {
  id: AdminSectionId;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

type PendingAdminSection = {
  href: string;
  startedAt: number;
};

const adminSections: AdminSection[] = [
  {
    id: "team",
    href: "/admin/team",
    label: "Team members",
    description: "Manage roles, departments, reviewer scope, and passwords.",
    icon: Users,
  },
  {
    id: "departments",
    href: "/admin/departments",
    label: "Departments",
    description: "Create and remove the departments used for assignments.",
    icon: Building2,
  },
  {
    id: "reports",
    href: "/admin/reports",
    label: "Reports",
    description: "Review, reopen, delete, and export employee reports.",
    icon: FileText,
  },
];

function activeSectionFromPathname(pathname: string | null) {
  if (pathname?.startsWith("/admin/departments")) {
    return "departments" as const;
  }

  if (pathname?.startsWith("/admin/reports")) {
    return "reports" as const;
  }

  return "team" as const;
}

export function AdminSectionFrame({
  children,
  activeSection,
  action,
}: {
  children: ReactNode;
  activeSection?: AdminSectionId;
  action?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingSection, setPendingSection] =
    useState<PendingAdminSection | null>(null);
  const committedChildrenRef = useRef(children);
  const currentSectionId =
    (pendingSection ? activeSectionFromPathname(pendingSection.href) : null) ??
    activeSection ??
    activeSectionFromPathname(pathname);
  const currentSection =
    adminSections.find((section) => section.id === currentSectionId) ??
    adminSections[0];
  const isTeamSection = currentSection.id === "team";
  const displayAction = pendingSection ? null : isTeamSection ? action : null;

  useEffect(() => {
    if (children === committedChildrenRef.current) {
      return;
    }

    committedChildrenRef.current = children;
    setPendingSection(null);
  }, [children]);

  useEffect(() => {
    if (
      !pendingSection ||
      pathname !== pendingSection.href
    ) {
      return;
    }

    const minimumSkeletonMs = 180;
    const elapsedMs = Date.now() - pendingSection.startedAt;
    const timeoutId = window.setTimeout(
      () => setPendingSection(null),
      Math.max(0, minimumSkeletonMs - elapsedMs),
    );

    return () => window.clearTimeout(timeoutId);
  }, [pathname, pendingSection]);

  function navigateSection(
    href: string,
    event: MouseEvent<HTMLAnchorElement>,
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      href === pathname
    ) {
      return;
    }

    event.preventDefault();
    flushSync(() => {
      setPendingSection({ href, startedAt: Date.now() });
    });
    router.push(href);
  }

  return (
    <main className="reference-page min-[1024px]:flex min-[1024px]:h-full min-[1024px]:min-h-0 min-[1024px]:flex-col">
      <div className="shrink-0">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
          <span className="text-[#2563eb]">Admin</span>
          <span className="text-[#98a2b3]">/</span>
          <span className="text-[#475467] dark:text-muted-foreground">
            {currentSection.label}
          </span>
        </div>
        <div className="reference-page-header">
          <div className="min-w-0">
            <h1 className="reference-title">Admin</h1>
            <p className="reference-subtitle">
              {currentSection.description}
            </p>
          </div>
          {displayAction ? <div className="shrink-0">{displayAction}</div> : null}
        </div>
      </div>

      <nav
        className="mb-3 flex shrink-0 flex-wrap gap-x-5 gap-y-2 border-b border-[#d9e1ec] dark:border-[#263a55]"
        aria-label="Admin sections"
      >
        {adminSections.map((section) => {
          const Icon = section.icon;
          const active = currentSectionId === section.id;

          return (
            <Link
              key={section.id}
              href={section.href}
              onClick={(event) => navigateSection(section.href, event)}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-2 pb-2.5 text-sm font-semibold transition-colors",
                active
                  ? "border-[#2563eb] text-[#2563eb] dark:border-[#60a5fa] dark:text-[#bfdbfe]"
                  : "border-transparent text-[#475467] hover:text-[#111827] dark:text-muted-foreground dark:hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-[18px] w-[18px]" />
              {section.label}
            </Link>
          );
        })}
      </nav>

      <div
        className="min-w-0 min-[1024px]:min-h-0 min-[1024px]:flex-1"
        aria-busy={Boolean(pendingSection)}
      >
        {pendingSection ? <AdminSectionContentSkeleton /> : children}
      </div>
    </main>
  );
}

export function AdminSectionLoadingFallback() {
  const pathname = usePathname();

  return (
    <AdminSectionFrame activeSection={activeSectionFromPathname(pathname)}>
      <AdminSectionContentSkeleton />
    </AdminSectionFrame>
  );
}

function AdminSectionContentSkeleton() {
  return (
    <section
      className="rounded-[10px] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.07)] ring-1 ring-[#e6ebf3] dark:bg-[#0f1b2a] dark:ring-[#1d2d43]"
      aria-label="Loading admin section"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-7 w-40 rounded-[4px]" />
        <Skeleton className="h-10 w-32 rounded-[8px]" />
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-[minmax(240px,1fr)_180px_180px]">
        <Skeleton className="h-10 rounded-[8px]" />
        <Skeleton className="h-10 rounded-[8px]" />
        <Skeleton className="h-10 rounded-[8px]" />
      </div>
      <div className="mt-5 space-y-3">
        <Skeleton className="h-14 rounded-[8px]" />
        <Skeleton className="h-14 rounded-[8px]" />
        <Skeleton className="h-14 rounded-[8px]" />
        <Skeleton className="h-14 rounded-[8px]" />
      </div>
    </section>
  );
}
