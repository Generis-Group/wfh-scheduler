"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Building2, FileText, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  AdminDepartmentsSectionSkeleton,
  AdminReportsSectionSkeleton,
  AdminTeamSectionSkeleton,
  type AdminSkeletonSection,
} from "@/components/reports/page-loading-skeleton";
import { cn } from "@/lib/utils";

export type AdminSectionId = "team" | "departments" | "reports";

type AdminSection = {
  id: AdminSectionId;
  href: string;
  label: string;
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
    icon: Users,
  },
  {
    id: "departments",
    href: "/admin/departments",
    label: "Departments",
    icon: Building2,
  },
  {
    id: "reports",
    href: "/admin/reports",
    label: "Report management",
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
  const isTeamSection = currentSectionId === "team";
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
        <div className="reference-page-header">
          <div className="min-w-0">
            <h1 className="reference-title">
              Manage roles, departments, and access
            </h1>
          </div>
          {displayAction ? <div className="shrink-0">{displayAction}</div> : null}
        </div>
      </div>

      <nav
        className="reference-section-tabs"
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
                "reference-section-tab",
                active
                  ? "border-primary text-primary dark:border-[#60a5fa] dark:text-[#bfdbfe]"
                  : "border-transparent text-foreground-muted hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground",
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
        className="min-w-0 min-[1024px]:flex min-[1024px]:min-h-0 min-[1024px]:flex-1 min-[1024px]:flex-col"
        aria-busy={Boolean(pendingSection)}
      >
        {pendingSection ? (
          <AdminSectionContentSkeleton section={currentSectionId} />
        ) : (
          children
        )}
      </div>
    </main>
  );
}

export function AdminSectionLoadingFallback() {
  const pathname = usePathname();

  return (
    <AdminSectionFrame activeSection={activeSectionFromPathname(pathname)}>
      <AdminSectionContentSkeleton section={activeSectionFromPathname(pathname)} />
    </AdminSectionFrame>
  );
}

function AdminSectionContentSkeleton({
  section = "team",
}: {
  section?: AdminSkeletonSection;
}) {
  if (section === "departments") {
    return (
      <div
        className="min-w-0 min-[1024px]:flex min-[1024px]:min-h-0 min-[1024px]:flex-1 min-[1024px]:flex-col"
        aria-label="Loading admin section"
      >
        <AdminDepartmentsSectionSkeleton />
      </div>
    );
  }

  if (section === "reports") {
    return (
      <div
        className="min-w-0 min-[1024px]:flex min-[1024px]:min-h-0 min-[1024px]:flex-1 min-[1024px]:flex-col"
        aria-label="Loading admin section"
      >
        <AdminReportsSectionSkeleton />
      </div>
    );
  }

  return (
    <div
      className="min-w-0 min-[1024px]:flex min-[1024px]:min-h-0 min-[1024px]:flex-1 min-[1024px]:flex-col"
      aria-label="Loading admin section"
    >
      <AdminTeamSectionSkeleton />
    </div>
  );
}
