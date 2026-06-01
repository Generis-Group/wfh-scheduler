"use client";

import { usePathname } from "next/navigation";

import {
  loadingKindFromHref,
  PageLoadingSkeleton,
} from "@/components/reports/page-loading-skeleton";

function fallbackVariant(pathname: string | null) {
  if (pathname?.startsWith("/admin")) {
    return "admin";
  }

  if (pathname?.startsWith("/review")) {
    return "reviewer";
  }

  return "employee";
}

export function AppShellLoadingFallback() {
  const pathname = usePathname();
  const variant = fallbackVariant(pathname);
  const kind = loadingKindFromHref(pathname ?? "/", variant);

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-[#0f172a] dark:bg-background dark:text-foreground lg:grid lg:h-screen lg:overflow-hidden lg:grid-cols-[176px_minmax(0,1fr)]">
      <div className="hidden lg:block" aria-hidden="true" />
      <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto">
        <PageLoadingSkeleton kind={kind} />
      </div>
    </div>
  );
}
