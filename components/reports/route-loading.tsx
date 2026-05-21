import Image from "next/image";

import {
  PageLoadingSkeleton,
  type PageLoadingKind,
} from "@/components/reports/page-loading-skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import generisLogo from "@/images/Generis_logo.png";
import { ReferenceAppShell } from "@/components/reports/reference-shell";

type ReferenceRouteLoadingVariant = "employee" | "admin" | "neutral";

export function ReferenceRouteLoading({
  active,
  kind,
  variant,
}: {
  active: string;
  kind: PageLoadingKind;
  variant: ReferenceRouteLoadingVariant;
}) {
  if (variant === "neutral") {
    return <NeutralReferenceRouteLoading kind={kind} />;
  }

  return (
    <ReferenceAppShell active={active} variant={variant} loading>
      <PageLoadingSkeleton kind={kind} />
    </ReferenceAppShell>
  );
}

function NeutralReferenceRouteLoading({ kind }: { kind: PageLoadingKind }) {
  return (
    <div className="reference-app-shell min-h-screen bg-[#f4f7fb] text-[#0f172a] dark:bg-background dark:text-foreground lg:grid lg:grid-cols-[176px_minmax(0,1fr)]">
      <aside className="reference-sidebar sticky top-0 hidden h-screen min-w-0 flex-col bg-white/88 px-3 py-4 shadow-[1px_0_0_rgba(15,23,42,0.04)] backdrop-blur-xl dark:bg-[#0b1422]/96 dark:shadow-[1px_0_0_rgba(255,255,255,0.04)] lg:flex">
        <div className="reference-sidebar-logo-link flex items-center rounded-[10px] px-1.5 py-1">
          <span className="reference-sidebar-logo-frame relative flex h-7 w-[132px] items-center overflow-hidden">
            <Image
              src={generisLogo}
              alt="Generis"
              className="reference-sidebar-logo-image h-auto w-full object-contain"
              priority
            />
          </span>
        </div>
        <nav className="reference-sidebar-nav mt-6 space-y-0.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="reference-sidebar-nav-link flex items-center gap-2.5 rounded-[9px] px-2.5 py-2"
            >
              <Skeleton className="h-4 w-4 shrink-0 rounded-[4px]" />
              <Skeleton className="reference-sidebar-nav-label h-3.5 w-20 rounded-[4px]" />
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 bg-white/92 shadow-[0_1px_0_rgba(15,23,42,0.05)] backdrop-blur-xl dark:bg-[#0b1422]/94 dark:shadow-[0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex h-12 w-full items-center justify-between gap-3 px-[clamp(14px,1.7vw,26px)] lg:justify-end">
            <div className="flex h-full min-w-0 items-center lg:hidden">
              <span className="relative flex h-7 w-[132px] items-center overflow-hidden">
                <Image
                  src={generisLogo}
                  alt="Generis"
                  className="h-auto w-full object-contain"
                  priority
                />
              </span>
            </div>
            <div className="relative flex items-center gap-2">
              <ThemeToggle />
              <div className="flex min-w-0 items-center gap-2 rounded-[10px] px-1.5 py-1">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="hidden h-4 w-28 rounded-[4px] sm:block" />
              </div>
            </div>
          </div>
        </header>
        <PageLoadingSkeleton kind={kind} />
      </div>
    </div>
  );
}
