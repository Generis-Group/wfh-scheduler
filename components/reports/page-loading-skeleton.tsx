import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

export type PageLoadingKind =
  | "daily"
  | "reports"
  | "review"
  | "employees"
  | "settings"
  | "account";

function LoadingBar({ className = "" }: { className?: string }) {
  return <Skeleton className={className} />;
}

function LoadingCard({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[8px] bg-white p-3.5 shadow-[0_6px_18px_rgba(15,23,42,0.045)] ring-1 ring-[#e6ebf3] dark:bg-[#0f1b2a] dark:ring-[#1d2d43] ${className}`}
    >
      {children}
    </section>
  );
}

function LoadingHeader({
  titleWidth = "w-56",
  subtitleWidth = "w-80",
}: {
  titleWidth?: string;
  subtitleWidth?: string;
}) {
  return (
    <div className="mb-3">
      <LoadingBar className={`h-7 ${titleWidth} max-w-full rounded-[4px]`} />
      <LoadingBar
        className={`mt-2 h-4 ${subtitleWidth} max-w-full rounded-[4px]`}
      />
    </div>
  );
}

function DailySkeleton() {
  return (
    <>
      <LoadingHeader titleWidth="w-48" subtitleWidth="w-72" />
      <LoadingCard className="mb-3">
        <div className="flex flex-col gap-2 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
          <div className="flex max-w-[430px] flex-1 gap-2">
            <LoadingBar className="h-10 w-10 shrink-0 rounded-[7px]" />
            <LoadingBar className="h-10 flex-1 rounded-[7px]" />
            <LoadingBar className="h-10 w-10 shrink-0 rounded-[7px]" />
          </div>
          <LoadingBar className="h-10 w-full max-w-[240px] rounded-[7px]" />
        </div>
      </LoadingCard>
      <div className="grid gap-3 min-[1200px]:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)] min-[1500px]:grid-cols-[minmax(0,1.18fr)_minmax(480px,0.82fr)]">
        <LoadingCard className="min-h-[560px]">
          <div className="flex items-center justify-between gap-4">
            <LoadingBar className="h-6 w-32 rounded-[4px]" />
            <LoadingBar className="h-9 w-28 rounded-[7px]" />
          </div>
          <LoadingBar className="mt-3 h-9 rounded-[7px]" />
          <div className="mt-3 space-y-2">
            <LoadingBar className="h-[68px] rounded-[8px]" />
            <LoadingBar className="h-[68px] rounded-[8px]" />
            <LoadingBar className="h-[68px] rounded-[8px]" />
            <LoadingBar className="h-[68px] rounded-[8px]" />
            <LoadingBar className="h-[68px] rounded-[8px]" />
          </div>
        </LoadingCard>
        <LoadingCard className="min-h-[560px]">
          <LoadingBar className="h-6 w-32 rounded-[4px]" />
          <LoadingBar className="mt-4 h-[480px] rounded-[7px]" />
        </LoadingCard>
      </div>
    </>
  );
}

function ReportsSkeleton() {
  return (
    <>
      <LoadingHeader titleWidth="w-36" subtitleWidth="w-72" />
      <LoadingCard className="mb-5">
        <div className="grid gap-3 min-[980px]:grid-cols-[minmax(260px,1fr)_190px_320px_150px]">
          <LoadingBar className="h-11 rounded-[8px]" />
          <LoadingBar className="h-11 rounded-[8px]" />
          <LoadingBar className="h-11 rounded-[8px]" />
          <LoadingBar className="h-11 rounded-[8px]" />
        </div>
      </LoadingCard>
      <LoadingCard>
        <div className="grid gap-3">
          <LoadingBar className="h-14 rounded-[8px]" />
          <LoadingBar className="h-20 rounded-[8px]" />
          <LoadingBar className="h-20 rounded-[8px]" />
          <LoadingBar className="h-20 rounded-[8px]" />
          <LoadingBar className="h-12 rounded-[8px]" />
        </div>
      </LoadingCard>
    </>
  );
}

function ReviewSkeleton() {
  return (
    <>
      <LoadingHeader titleWidth="w-56" subtitleWidth="w-96" />
      <div className="mb-4 grid gap-3 min-[920px]:grid-cols-4">
        <LoadingCard>
          <LoadingBar className="h-20" />
        </LoadingCard>
        <LoadingCard>
          <LoadingBar className="h-20" />
        </LoadingCard>
        <LoadingCard>
          <LoadingBar className="h-20" />
        </LoadingCard>
        <LoadingCard>
          <LoadingBar className="h-20" />
        </LoadingCard>
      </div>
      <div className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <LoadingCard className="min-h-[460px]">
          <LoadingBar className="h-11 rounded-[8px]" />
          <div className="mt-5 space-y-3">
            <LoadingBar className="h-16 rounded-[8px]" />
            <LoadingBar className="h-16 rounded-[8px]" />
            <LoadingBar className="h-16 rounded-[8px]" />
            <LoadingBar className="h-16 rounded-[8px]" />
          </div>
        </LoadingCard>
        <LoadingCard className="min-h-[460px]">
          <LoadingBar className="h-7 w-44" />
          <LoadingBar className="mt-6 h-32 rounded-[8px]" />
          <LoadingBar className="mt-5 h-24 rounded-[8px]" />
          <LoadingBar className="mt-5 h-24 rounded-[8px]" />
        </LoadingCard>
      </div>
    </>
  );
}

function EmployeesSkeleton() {
  return (
    <>
      <LoadingHeader titleWidth="w-40" subtitleWidth="w-96" />
      <div className="grid items-start gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_360px]">
        <LoadingCard className="min-h-[460px]">
          <LoadingBar className="h-7 w-40" />
          <div className="mt-6 space-y-3">
            <LoadingBar className="h-12 rounded-[8px]" />
            <LoadingBar className="h-14 rounded-[8px]" />
            <LoadingBar className="h-14 rounded-[8px]" />
            <LoadingBar className="h-14 rounded-[8px]" />
          </div>
        </LoadingCard>
        <LoadingCard className="min-h-[360px]">
          <LoadingBar className="h-7 w-32" />
          <LoadingBar className="mt-6 h-10 rounded-[8px]" />
          <LoadingBar className="mt-4 h-10 rounded-[8px]" />
          <LoadingBar className="mt-4 h-10 rounded-[8px]" />
          <LoadingBar className="mt-5 h-11 rounded-[8px]" />
        </LoadingCard>
      </div>
    </>
  );
}

function SettingsSkeleton({ account = false }: { account?: boolean }) {
  return (
    <>
      <LoadingHeader
        titleWidth={account ? "w-36" : "w-40"}
        subtitleWidth="w-96"
      />
      <div className="grid gap-4 min-[1060px]:grid-cols-2">
        <LoadingCard className="min-h-[260px]">
          <LoadingBar className="h-7 w-44" />
          <LoadingBar className="mt-6 h-11 rounded-[8px]" />
          <LoadingBar className="mt-4 h-11 rounded-[8px]" />
          <LoadingBar className="mt-4 h-20 rounded-[8px]" />
        </LoadingCard>
        <LoadingCard className="min-h-[260px]">
          <LoadingBar className="h-7 w-40" />
          <LoadingBar className="mt-6 h-11 rounded-[8px]" />
          <LoadingBar className="mt-4 h-11 rounded-[8px]" />
          <LoadingBar className="mt-4 h-20 rounded-[8px]" />
        </LoadingCard>
      </div>
    </>
  );
}

export function loadingKindFromHref(
  href: string,
  fallbackVariant: "employee" | "admin" = "employee",
): PageLoadingKind {
  const path = href.split("?")[0] || "/";

  if (path.endsWith("/reports") || path.endsWith("/history")) {
    return "reports";
  }

  if (path.endsWith("/review")) {
    return "review";
  }

  if (path.endsWith("/admin") || path.endsWith("/employees")) {
    return "employees";
  }

  if (path.endsWith("/account")) {
    return "account";
  }

  if (path.endsWith("/settings") || path.endsWith("/admin-settings")) {
    return "settings";
  }

  if (path === "/" || path === "") {
    return fallbackVariant === "admin" ? "review" : "daily";
  }

  return fallbackVariant === "admin" ? "review" : "daily";
}

export function PageLoadingSkeleton({
  kind = "daily",
}: {
  kind?: PageLoadingKind;
}) {
  return (
    <main className="reference-page" aria-busy="true" aria-label="Loading page">
      {kind === "daily" ? <DailySkeleton /> : null}
      {kind === "reports" ? <ReportsSkeleton /> : null}
      {kind === "review" ? <ReviewSkeleton /> : null}
      {kind === "employees" ? <EmployeesSkeleton /> : null}
      {kind === "settings" ? <SettingsSkeleton /> : null}
      {kind === "account" ? <SettingsSkeleton account /> : null}
    </main>
  );
}
