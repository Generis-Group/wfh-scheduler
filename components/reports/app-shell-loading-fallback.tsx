"use client";

import { usePathname } from "next/navigation";

import {
  loadingKindFromHref,
  PageLoadingSkeleton,
} from "@/components/reports/page-loading-skeleton";
import { ReferenceAppShell } from "@/components/reports/reference-shell";

function fallbackVariant(pathname: string | null) {
  if (pathname?.startsWith("/admin")) {
    return "admin";
  }

  if (pathname?.startsWith("/review") || pathname?.startsWith("/coo")) {
    return "reviewer";
  }

  return "employee";
}

export function AppShellLoadingFallback() {
  const pathname = usePathname();
  const variant = fallbackVariant(pathname);
  const kind = loadingKindFromHref(pathname ?? "/", variant);

  return (
    <ReferenceAppShell
      variant={variant}
      displayName=""
      userRole={
        variant === "admin"
          ? "Admin"
          : variant === "reviewer"
            ? "Reviewer"
            : "Employee"
      }
      mustChangePassword={false}
      profileLoading
    >
      <PageLoadingSkeleton kind={kind} />
    </ReferenceAppShell>
  );
}
