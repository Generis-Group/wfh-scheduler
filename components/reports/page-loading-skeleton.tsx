import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type PageLoadingKind =
  | "daily"
  | "reports"
  | "review"
  | "admin"
  | "admin-team"
  | "admin-departments"
  | "admin-reports"
  | "bugs"
  | "settings"
  | "settings-account"
  | "settings-integrations"
  | "settings-company";

export type AdminSkeletonSection = "team" | "departments" | "reports";

const reportHistorySkeletonGridClass =
  "min-[860px]:grid min-[860px]:grid-cols-[minmax(8.5rem,0.75fr)_minmax(7.5rem,0.6fr)_minmax(14rem,2.5fr)_minmax(7rem,0.55fr)] min-[860px]:items-center";

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
    <section className={cn("reference-card p-3", className)}>{children}</section>
  );
}

function LoadingHeader({
  titleWidth = "w-56",
  actions,
}: {
  titleWidth?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="reference-page-header shrink-0">
      <div className="min-w-0">
        <LoadingBar className={`h-7 ${titleWidth} max-w-full rounded-[4px]`} />
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

function HeaderActionSkeletons() {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <LoadingBar className="h-10 w-32 rounded-[8px]" />
      <LoadingBar className="h-10 w-36 rounded-[8px]" />
    </div>
  );
}

function DateToolbarSkeleton({
  showTrailingActions = false,
}: {
  showTrailingActions?: boolean;
}) {
  return (
    <LoadingCard className="mb-3 shrink-0">
      <div className="grid gap-2 min-[760px]:h-10 min-[760px]:grid-cols-[minmax(240px,300px)_auto] min-[760px]:items-center min-[760px]:justify-between">
        <div className="flex max-w-[300px] gap-2">
          <LoadingBar className="h-10 w-10 shrink-0 rounded-[8px]" />
          <LoadingBar className="h-10 flex-1 rounded-[8px]" />
        </div>
        {showTrailingActions ? <HeaderActionSkeletons /> : null}
      </div>
    </LoadingCard>
  );
}

function PaginationFooterSkeleton() {
  return (
    <div className="reference-paginated-footer flex justify-end gap-7 px-3 pb-3 pt-5">
      <LoadingBar className="h-[34px] w-28 rounded-[8px]" />
      <LoadingBar className="h-[34px] w-36 rounded-[8px]" />
    </div>
  );
}

function DailySkeleton() {
  return (
    <>
      <LoadingHeader
        titleWidth="w-72"
        actions={
          <div className="flex flex-wrap gap-2 max-[639px]:w-full max-[639px]:flex-col max-[639px]:items-stretch">
            <LoadingBar className="h-10 w-32 rounded-[8px] max-[639px]:w-full" />
            <LoadingBar className="h-10 w-36 rounded-[8px] max-[639px]:w-full" />
          </div>
        }
      />
      <LoadingCard className="mb-3 shrink-0 max-[639px]:p-2.5">
        <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
          <div className="flex w-full gap-2 sm:w-[300px]">
            <LoadingBar className="h-10 w-10 shrink-0 rounded-[7px]" />
            <LoadingBar className="h-10 flex-1 rounded-[7px]" />
          </div>
          <LoadingBar className="h-10 w-full rounded-[7px] sm:w-[220px]" />
        </div>
      </LoadingCard>
      <div className="daily-report-layout grid gap-3 min-[1200px]:min-h-0 min-[1200px]:flex-1 min-[1200px]:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)] min-[1500px]:grid-cols-[minmax(0,1.18fr)_minmax(480px,0.82fr)]">
        <LoadingCard className="daily-report-panel flex min-h-[520px] flex-col min-[1200px]:min-h-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <LoadingBar className="h-6 w-24 rounded-[4px]" />
              <LoadingBar className="h-6 w-14 rounded-full" />
            </div>
            <LoadingBar className="h-9 w-28 rounded-[7px]" />
          </div>
          <LoadingBar className="mt-3 h-9 rounded-[7px]" />
          <div className="daily-work-items-list mt-3 min-h-[320px] space-y-2 overflow-hidden p-1 min-[1200px]:min-h-0 min-[1200px]:flex-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="grid min-h-[68px] grid-cols-[24px_34px_minmax(0,1fr)_58px_28px] items-center gap-2.5 rounded-[8px] bg-white px-3 py-2.5 ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
              >
                <LoadingBar className="h-4 w-4 rounded-[4px]" />
                <LoadingBar className="h-8 w-8 rounded-[7px]" />
                <div className="min-w-0">
                  <LoadingBar className="h-4 w-full max-w-[360px] rounded-[4px]" />
                  <LoadingBar className="mt-2 h-3 w-28 rounded-[4px]" />
                </div>
                <LoadingBar className="h-6 rounded-full" />
                <LoadingBar className="h-7 w-7 rounded-[7px]" />
              </div>
            ))}
          </div>
        </LoadingCard>
        <LoadingCard className="daily-report-panel daily-summary-panel flex min-h-[520px] flex-col min-[1200px]:min-h-0">
          <div className="flex items-center justify-between gap-3">
            <LoadingBar className="h-6 w-28 rounded-[4px]" />
            <LoadingBar className="h-8 w-24 rounded-[7px]" />
          </div>
          <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-[8px] bg-white ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:ring-[#263a55]">
            <LoadingBar className="m-3 h-5 w-40 rounded-[4px]" />
            <LoadingBar className="mx-3 h-4 w-[82%] rounded-[4px]" />
            <LoadingBar className="mx-3 mt-2 h-4 w-[74%] rounded-[4px]" />
            <LoadingBar className="mx-3 mt-2 h-4 w-[88%] rounded-[4px]" />
            <div className="mt-auto border-t border-[#e1e6ef] p-3 dark:border-[#263a55]">
              <LoadingBar className="h-9 rounded-[7px]" />
            </div>
          </div>
        </LoadingCard>
      </div>
    </>
  );
}

function ReportsSkeleton() {
  return (
    <>
      <LoadingHeader titleWidth="w-64" />
      <LoadingCard className="mb-3 shrink-0">
        <div className="grid gap-3 min-[980px]:grid-cols-[minmax(260px,1fr)_190px_320px_150px]">
          <LoadingBar className="h-11 rounded-[8px]" />
          <LoadingBar className="h-11 rounded-[8px]" />
          <LoadingBar className="h-11 rounded-[8px]" />
          <LoadingBar className="h-11 rounded-[8px]" />
        </div>
      </LoadingCard>
      <section className="reference-card reference-paginated-surface min-[1024px]:flex-1">
        <div className="reference-paginated-viewport overflow-x-hidden">
          <div
            className={`sticky top-0 z-10 hidden border-b border-[#e8ecf3] bg-white px-4 py-3 dark:border-[#263a55] dark:bg-[#0f1b2a] ${reportHistorySkeletonGridClass}`}
          >
            <LoadingBar className="h-4 w-16 rounded-[4px]" />
            <LoadingBar className="h-4 w-16 rounded-[4px]" />
            <LoadingBar className="h-4 w-20 rounded-[4px]" />
            <LoadingBar className="ml-auto h-4 w-16 rounded-[4px]" />
          </div>
          <div className="divide-y divide-[#e8ecf3] dark:divide-[#263a55]">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className={`space-y-3 px-4 py-3 min-[860px]:min-h-[86px] min-[860px]:space-y-0 ${reportHistorySkeletonGridClass}`}
              >
                <div>
                  <LoadingBar className="h-4 w-24 rounded-[4px]" />
                  <LoadingBar className="mt-2 h-3 w-12 rounded-[4px]" />
                </div>
                <LoadingBar className="h-6 w-20 rounded-[7px]" />
                <div className="min-w-0">
                  <LoadingBar className="h-5 w-full max-w-[360px] rounded-[4px]" />
                  <LoadingBar className="mt-2 h-4 w-32 rounded-[4px]" />
                </div>
                <div className="flex justify-start gap-3 min-[860px]:justify-end">
                  <LoadingBar className="h-9 w-20 rounded-[7px]" />
                  <LoadingBar className="h-8 w-8 rounded-[8px]" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <PaginationFooterSkeleton />
      </section>
    </>
  );
}

function ReviewTableSkeleton() {
  return (
    <div
      aria-label="Employee reports table loading viewport"
      className="reference-paginated-viewport reference-visible-rows-viewport reference-review-table-viewport px-3"
    >
      <table className="w-full table-fixed text-xs">
        <thead className="sticky top-0 z-10 bg-white dark:bg-[#0f1b2a]">
          <tr className="border-b border-[#e5eaf2] dark:border-[#263a55]">
            <th className="w-[32px] px-1 py-2 min-[700px]:w-[36px] min-[700px]:px-2">
              <LoadingBar className="h-4 w-4 rounded-[4px]" />
            </th>
            <th className="w-[43%] px-2 py-2 min-[700px]:w-[30%] min-[980px]:w-[24%] min-[1180px]:w-[22%]">
              <LoadingBar className="h-4 w-20 rounded-[4px]" />
            </th>
            <th className="hidden w-[15%] px-2 py-2 min-[760px]:table-cell">
              <LoadingBar className="h-4 w-24 rounded-[4px]" />
            </th>
            <th className="w-[24%] px-2 py-2 min-[700px]:w-[16%] min-[980px]:w-[12%]">
              <LoadingBar className="h-4 w-16 rounded-[4px]" />
            </th>
            <th className="hidden w-[16%] px-2 py-2 min-[1180px]:table-cell">
              <LoadingBar className="h-4 w-14 rounded-[4px]" />
            </th>
            <th className="hidden w-[12%] px-2 py-2 min-[980px]:table-cell">
              <LoadingBar className="h-4 w-20 rounded-[4px]" />
            </th>
            <th className="hidden w-[16%] px-2 py-2 min-[700px]:table-cell min-[980px]:w-[14%]">
              <LoadingBar className="h-4 w-20 rounded-[4px]" />
            </th>
            <th className="w-[58px] px-1 py-2 min-[700px]:w-[68px] min-[700px]:px-2">
              <LoadingBar className="ml-auto h-4 w-14 rounded-[4px]" />
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, index) => (
            <tr
              key={index}
              className="h-14 border-b border-[#e5eaf2] last:border-b-0 dark:border-[#263a55]"
            >
              <td className="px-1 py-2.5 min-[700px]:px-2">
                <LoadingBar className="h-4 w-4 rounded-[4px]" />
              </td>
              <td className="min-w-0 px-2 py-2.5">
                <div className="flex min-w-0 items-center gap-2 min-[700px]:gap-3">
                  <LoadingBar className="h-2 w-2 rounded-full" />
                  <LoadingBar className="h-8 w-8 rounded-full" />
                  <LoadingBar className="h-4 w-28 rounded-[4px]" />
                </div>
              </td>
              <td className="hidden px-2 py-2.5 min-[760px]:table-cell">
                <LoadingBar className="h-4 w-16 rounded-[4px]" />
              </td>
              <td className="px-2 py-2.5">
                <LoadingBar className="h-6 w-20 rounded-[7px]" />
              </td>
              <td className="hidden px-2 py-2.5 min-[1180px]:table-cell">
                <LoadingBar className="h-6 w-16 rounded-full" />
              </td>
              <td className="hidden px-2 py-2.5 min-[980px]:table-cell">
                <LoadingBar className="h-4 w-14 rounded-[4px]" />
              </td>
              <td className="hidden px-2 py-2.5 min-[700px]:table-cell">
                <LoadingBar className="h-4 w-20 rounded-[4px]" />
              </td>
              <td className="px-1 py-2.5 text-right min-[700px]:px-2">
                <LoadingBar className="ml-auto h-8 w-8 rounded-[7px]" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <>
      <LoadingHeader titleWidth="w-80" />
      <DateToolbarSkeleton showTrailingActions />
      <section className="reference-card reference-paginated-surface min-[1024px]:flex-1">
        <div className="grid shrink-0 gap-3 p-3 min-[1180px]:grid-cols-[auto_minmax(0,1fr)] min-[1180px]:items-start">
          <div className="flex min-w-0 items-center gap-3 pt-1">
            <LoadingBar className="h-7 w-40 rounded-[4px]" />
            <LoadingBar className="h-9 w-36 rounded-[9px]" />
          </div>
          <div className="grid w-full gap-2 min-[760px]:grid-cols-[minmax(220px,1fr)_minmax(190px,260px)] min-[1040px]:grid-cols-[minmax(220px,1fr)_minmax(190px,260px)_minmax(232px,280px)_auto] min-[1180px]:justify-self-end">
            <LoadingBar className="h-10 rounded-[8px]" />
            <LoadingBar className="h-10 rounded-[8px]" />
            <LoadingBar className="h-10 rounded-[8px]" />
            <LoadingBar className="h-10 w-16 rounded-[8px]" />
          </div>
        </div>
        <ReviewTableSkeleton />
        <PaginationFooterSkeleton />
      </section>
    </>
  );
}

export function AdminTeamSectionSkeleton() {
  return (
    <div className="reference-admin-team-layout grid items-start gap-3 min-[1180px]:h-full min-[1180px]:min-h-0 min-[1180px]:items-stretch">
      <section className="reference-card reference-paginated-surface min-[1180px]:h-full min-[1180px]:self-stretch">
        <div className="p-2.5 pb-1">
          <LoadingBar className="h-6 w-36 rounded-[4px]" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-2 pb-0 pt-0">
          <div className="grid gap-2 rounded-[8px] bg-[#f8fafc]/70 p-1.5 dark:bg-white/[0.025] min-[900px]:grid-cols-[minmax(240px,1fr)_auto] min-[900px]:items-center">
            <LoadingBar className="h-8 rounded-[8px]" />
            <div className="grid gap-2 min-[520px]:grid-cols-[auto_auto] min-[520px]:items-center min-[900px]:justify-end">
              <LoadingBar className="h-4 w-24 rounded-[4px]" />
              <LoadingBar className="h-8 w-[104px] rounded-[7px]" />
            </div>
          </div>
          <div className="reference-paginated-viewport reference-visible-rows-viewport reference-team-member-viewport space-y-1 pr-1 min-[1180px]:mt-1">
            <div
              className="reference-team-member-header reference-team-member-row-grid sticky top-0 z-10 hidden bg-white px-2 dark:bg-[#0f1b2a] min-[900px]:grid"
            >
              <LoadingBar className="h-4 w-4 rounded-[4px]" />
              <LoadingBar className="h-3 w-24 rounded-[4px]" />
              <LoadingBar className="h-3 w-12 rounded-[4px]" />
              <LoadingBar className="h-3 w-24 rounded-[4px]" />
              <LoadingBar className="h-3 w-24 rounded-[4px]" />
            </div>
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="reference-team-member-row-grid rounded-[8px] bg-[#f8fafc]/82 px-2 py-1.5 dark:bg-white/[0.035] min-[900px]:min-h-14"
              >
                <LoadingBar className="h-4 w-4 rounded-[4px]" />
                <div className="min-w-0">
                  <LoadingBar className="h-4 w-32 rounded-[4px]" />
                  <LoadingBar className="mt-2 h-3 w-40 max-w-full rounded-[4px]" />
                </div>
                <LoadingBar className="col-span-2 h-8 rounded-[8px] min-[900px]:col-span-1" />
                <LoadingBar className="col-span-2 h-8 rounded-[8px] min-[900px]:col-span-1" />
                <LoadingBar className="col-span-2 h-8 rounded-[8px] min-[900px]:col-span-1" />
              </div>
            ))}
          </div>
          <PaginationFooterSkeleton />
        </div>
      </section>
      <div className="min-w-0 space-y-2 min-[1180px]:grid min-[1180px]:h-full min-[1180px]:min-h-0 min-[1180px]:grid-rows-[auto_minmax(0,1fr)] min-[1180px]:content-stretch min-[1180px]:gap-2 min-[1180px]:space-y-0">
        <LoadingCard className="p-2">
          <LoadingBar className="h-6 w-40 rounded-[4px]" />
          <LoadingBar className="mt-2 h-4 w-56 max-w-full rounded-[4px]" />
          <div className="mt-3 space-y-1.5">
            <LoadingBar className="h-8 rounded-[8px]" />
            <LoadingBar className="h-8 rounded-[8px]" />
            <LoadingBar className="h-8 rounded-[8px]" />
            <LoadingBar className="h-8 rounded-[8px]" />
          </div>
        </LoadingCard>
        <LoadingCard className="p-2 min-[1180px]:self-end">
          <div className="flex items-center justify-between gap-2">
            <LoadingBar className="h-6 w-20 rounded-[4px]" />
            <LoadingBar className="h-5 w-16 rounded-full" />
          </div>
          <div className="mt-3 space-y-2">
            <LoadingBar className="h-8 rounded-[7px]" />
            <LoadingBar className="h-8 rounded-[7px]" />
            <LoadingBar className="h-8 rounded-[7px]" />
            <LoadingBar className="h-8 rounded-[8px]" />
          </div>
        </LoadingCard>
      </div>
    </div>
  );
}

export function AdminDepartmentsSectionSkeleton() {
  return (
    <div className="grid items-start gap-3 min-[900px]:grid-cols-[minmax(0,1fr)]">
      <div className="min-w-0 min-[900px]:flex min-[900px]:h-full min-[900px]:min-h-0 min-[900px]:flex-col">
        <LoadingCard className="min-[900px]:flex min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:flex-col">
          <LoadingBar className="h-6 w-32 rounded-[4px]" />
          <LoadingBar className="mt-2 h-4 w-[min(34rem,90%)] rounded-[4px]" />
          <div className="mt-3 flex gap-2">
            <LoadingBar className="h-8 flex-1 rounded-[8px]" />
            <LoadingBar className="h-8 w-16 rounded-[7px]" />
          </div>
          <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-hidden pr-1">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="flex min-h-10 items-center gap-2 rounded-[8px] bg-[#f8fafc] px-2 py-1.5 ring-1 ring-[#e2e8f0] dark:bg-white/[0.04] dark:ring-white/[0.08]"
              >
                <LoadingBar className="h-4 flex-1 rounded-[4px]" />
                <LoadingBar className="h-7 w-7 rounded-[7px]" />
              </div>
            ))}
          </div>
          <PaginationFooterSkeleton />
        </LoadingCard>
      </div>
    </div>
  );
}

export function AdminReportsSectionSkeleton() {
  return (
    <section className="reference-card reference-paginated-surface p-0 min-[1024px]:h-full">
      <div className="shrink-0 border-b border-[#e5eaf2] p-3 dark:border-[#263a55]">
        <div className="flex flex-col gap-3 min-[820px]:flex-row min-[820px]:items-center">
          <LoadingBar className="h-10 min-w-0 flex-1 rounded-[8px]" />
          <LoadingBar className="h-10 w-full rounded-[8px] min-[820px]:w-44" />
          <LoadingBar className="h-4 w-24 rounded-[4px] min-[820px]:ml-auto" />
        </div>
      </div>
      <div className="min-h-0 min-[1024px]:flex-1 min-[1024px]:overflow-hidden">
        <div className="divide-y divide-[#e5eaf2] dark:divide-[#263a55]">
          {Array.from({ length: 6 }).map((_, index) => (
            <article key={index} className="reference-admin-report-row-grid">
              <div className="min-w-0">
                <div className="flex min-w-0 items-start gap-3">
                  <LoadingBar className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <LoadingBar className="h-4 w-32 rounded-[4px]" />
                      <LoadingBar className="h-6 w-20 rounded-[7px]" />
                    </div>
                    <LoadingBar className="mt-2 h-3 w-56 max-w-full rounded-[4px]" />
                    <LoadingBar className="mt-2 h-4 w-full max-w-[520px] rounded-[4px]" />
                  </div>
                </div>
              </div>
              <LoadingBar className="h-9 w-24 rounded-[7px]" />
              <div className="grid grid-cols-2 gap-2 min-[860px]:block min-[860px]:space-y-2">
                <LoadingBar className="h-8 rounded-[7px]" />
                <LoadingBar className="h-8 rounded-[7px]" />
              </div>
              <LoadingBar className="h-9 rounded-[7px] min-[860px]:w-28" />
            </article>
          ))}
        </div>
      </div>
      <PaginationFooterSkeleton />
    </section>
  );
}

function AdminSectionSkeleton({
  section = "team",
}: {
  section?: AdminSkeletonSection;
}) {
  if (section === "departments") {
    return <AdminDepartmentsSectionSkeleton />;
  }

  if (section === "reports") {
    return <AdminReportsSectionSkeleton />;
  }

  return <AdminTeamSectionSkeleton />;
}

function AdminSkeleton({
  section = "team",
}: {
  section?: AdminSkeletonSection;
}) {
  return (
    <>
      <LoadingHeader
        titleWidth="w-72"
        actions={
          section === "team" ? (
            <LoadingBar className="h-10 w-32 rounded-[8px]" />
          ) : null
        }
      />
      <div className="reference-section-tabs">
        <LoadingBar className="h-8 w-36 rounded-[4px]" />
        <LoadingBar className="h-8 w-32 rounded-[4px]" />
        <LoadingBar className="h-8 w-44 rounded-[4px]" />
      </div>
      <AdminSectionSkeleton section={section} />
    </>
  );
}

function BugComposerSkeleton() {
  return (
    <LoadingCard className="min-[980px]:flex min-[980px]:h-full min-[980px]:min-h-0 min-[980px]:flex-col">
      <div className="flex items-start gap-3">
        <LoadingBar className="h-10 w-10 shrink-0 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <LoadingBar className="h-6 w-44 rounded-[4px]" />
          <LoadingBar className="mt-2 h-4 w-64 max-w-full rounded-[4px]" />
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <LoadingBar className="h-10 rounded-[8px]" />
        <LoadingBar className="h-10 rounded-[8px]" />
      </div>
      <LoadingBar className="mt-3 h-10 rounded-[8px]" />
      <LoadingBar className="mt-3 min-h-[180px] flex-1 rounded-[8px]" />
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <LoadingBar className="h-9 w-32 rounded-[8px]" />
        <LoadingBar className="h-9 w-28 rounded-[8px]" />
      </div>
    </LoadingCard>
  );
}

function BugInboxSkeleton() {
  return (
    <section className="reference-card min-w-0 overflow-hidden p-0 min-[980px]:flex min-[980px]:h-full min-[980px]:min-h-0 min-[980px]:flex-col">
      <div className="border-b border-[#e5eaf2] p-3 pb-2 dark:border-[#263a55]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <LoadingBar className="h-6 w-40 rounded-[4px]" />
            <LoadingBar className="mt-2 h-3 w-24 rounded-[4px]" />
          </div>
          <LoadingBar className="h-8 w-32 rounded-[8px]" />
        </div>
      </div>
      <div className="space-y-2 p-3 min-[980px]:flex min-[980px]:min-h-0 min-[980px]:flex-1 min-[980px]:flex-col min-[980px]:gap-2 min-[980px]:space-y-0">
        <LoadingBar className="h-9 rounded-[8px]" />
        <div className="min-h-0 space-y-2 overflow-hidden pr-1 min-[980px]:flex-1">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="rounded-[8px] bg-[#f8fafc] p-3 ring-1 ring-[#e6ebf3] dark:bg-white/[0.035] dark:ring-[#263a55]"
            >
              <LoadingBar className="h-4 w-[70%] rounded-[4px]" />
              <LoadingBar className="mt-2 h-3 w-[52%] rounded-[4px]" />
              <LoadingBar className="mt-3 h-5 w-24 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BugsSkeleton() {
  return (
    <>
      <LoadingHeader titleWidth="w-64" />
      <div className="grid min-w-0 items-start gap-3 min-[980px]:min-h-0 min-[980px]:flex-1 min-[980px]:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] min-[980px]:items-stretch">
        <BugComposerSkeleton />
        <BugInboxSkeleton />
      </div>
    </>
  );
}

function SettingsTabsSkeleton() {
  return (
    <div className="reference-section-tabs">
      <LoadingBar className="h-8 w-28 rounded-[4px]" />
      <LoadingBar className="h-8 w-36 rounded-[4px]" />
      <LoadingBar className="h-8 w-28 rounded-[4px]" />
    </div>
  );
}

function SettingsAccountSkeleton() {
  return (
    <div className="grid min-w-0 items-start gap-4 min-[1080px]:grid-cols-[minmax(0,1fr)_420px]">
      <LoadingCard className="flex min-h-[414px] flex-col overflow-hidden p-0">
        <div className="px-5 py-5">
          <div className="flex items-start gap-3">
            <LoadingBar className="h-10 w-10 shrink-0 rounded-[10px]" />
            <div>
              <LoadingBar className="h-6 w-24 rounded-[4px]" />
              <LoadingBar className="mt-2 h-4 w-64 max-w-full rounded-[4px]" />
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col px-5 pb-5">
          <div className="flex min-h-[114px] flex-wrap items-center gap-5 rounded-[8px] border border-[#dfe7f2] bg-white px-5 py-4 dark:border-[#263a55] dark:bg-[#0b1523]">
            <LoadingBar className="h-20 w-20 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 basis-48">
              <LoadingBar className="h-5 w-44 rounded-[4px]" />
              <LoadingBar className="mt-2 h-4 w-56 max-w-full rounded-[4px]" />
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <LoadingBar className="h-11 rounded-[8px]" />
            <LoadingBar className="h-11 rounded-[8px]" />
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#e6ebf3] pt-5 dark:border-[#263a55]">
            <LoadingBar className="h-4 w-36 rounded-[4px]" />
            <LoadingBar className="h-10 w-40 rounded-[8px]" />
          </div>
        </div>
      </LoadingCard>
      <LoadingCard className="overflow-hidden p-0">
        <div className="px-5 py-5">
          <div className="flex items-start gap-3">
            <LoadingBar className="h-10 w-10 shrink-0 rounded-[10px]" />
            <div>
              <LoadingBar className="h-6 w-28 rounded-[4px]" />
              <LoadingBar className="mt-2 h-4 w-56 max-w-full rounded-[4px]" />
            </div>
          </div>
        </div>
        <div className="space-y-4 px-5 pb-5">
          <LoadingBar className="h-10 rounded-[8px]" />
          <LoadingBar className="h-10 rounded-[8px]" />
          <LoadingBar className="h-10 rounded-[8px]" />
          <LoadingBar className="h-10 rounded-[8px]" />
        </div>
      </LoadingCard>
    </div>
  );
}

function SettingsIntegrationsSkeleton() {
  return (
    <div className="min-w-0 space-y-4 min-[1024px]:min-h-0 min-[1024px]:flex-1 min-[1024px]:overflow-hidden">
      <div className="grid min-w-0 gap-4 min-[980px]:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <LoadingCard key={index} className="overflow-hidden p-0">
            <div className="px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <LoadingBar className="h-12 w-12 shrink-0 rounded-[10px]" />
                  <div className="min-w-0 pt-1">
                    <LoadingBar className="h-6 w-40 rounded-[4px]" />
                    <LoadingBar className="mt-2 h-4 w-64 max-w-full rounded-[4px]" />
                  </div>
                </div>
                <LoadingBar className="h-6 w-24 shrink-0 rounded-full" />
              </div>
            </div>
            <div className="space-y-4 px-5 pb-5">
              <div className="flex flex-wrap gap-2">
                <LoadingBar className="h-9 w-32 rounded-[8px]" />
                <LoadingBar className="h-9 w-28 rounded-[8px]" />
              </div>
              <LoadingBar className="h-10 rounded-[8px]" />
              <LoadingBar className="h-4 w-52 max-w-full rounded-[4px]" />
            </div>
          </LoadingCard>
        ))}
      </div>
      <LoadingCard className="overflow-hidden p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <LoadingBar className="h-12 w-12 shrink-0 rounded-[10px]" />
            <div>
              <LoadingBar className="h-6 w-40 rounded-[4px]" />
              <LoadingBar className="mt-2 h-4 w-72 max-w-full rounded-[4px]" />
            </div>
          </div>
          <LoadingBar className="h-6 w-20 rounded-full" />
        </div>
        <div className="mt-4 grid max-h-52 gap-2 overflow-hidden rounded-[8px] border border-[#dfe7f2] bg-white p-2 dark:border-[#263a55] dark:bg-[#0b1523]">
          {Array.from({ length: 4 }).map((_, index) => (
            <LoadingBar key={index} className="h-10 rounded-[6px]" />
          ))}
        </div>
      </LoadingCard>
    </div>
  );
}

function SettingsCompanySkeleton() {
  return (
    <div className="min-w-0 space-y-4 min-[1024px]:min-h-0 min-[1024px]:flex-1 min-[1024px]:overflow-hidden">
      <div className="flex items-start gap-4">
        <LoadingBar className="h-12 w-12 shrink-0 rounded-[10px]" />
        <div className="min-w-0 pt-1">
          <LoadingBar className="h-6 w-28 rounded-[4px]" />
          <LoadingBar className="mt-2 h-4 w-72 max-w-full rounded-[4px]" />
        </div>
      </div>
      <LoadingCard className="p-0">
        <div className="px-5 py-5">
          <div className="flex items-start gap-3">
            <LoadingBar className="h-10 w-10 shrink-0 rounded-[10px]" />
            <div>
              <LoadingBar className="h-6 w-40 rounded-[4px]" />
              <LoadingBar className="mt-2 h-4 w-64 max-w-full rounded-[4px]" />
            </div>
          </div>
        </div>
        <div className="px-5 pb-5">
          <LoadingBar className="h-10 rounded-[8px]" />
          <div className="mt-4 flex justify-end">
            <LoadingBar className="h-10 w-44 rounded-[8px]" />
          </div>
        </div>
      </LoadingCard>
    </div>
  );
}

function SettingsSkeleton({
  section = "account",
}: {
  section?: "account" | "integrations" | "company";
}) {
  return (
    <>
      <LoadingHeader titleWidth="w-80" />
      <SettingsTabsSkeleton />
      {section === "integrations" ? <SettingsIntegrationsSkeleton /> : null}
      {section === "company" ? <SettingsCompanySkeleton /> : null}
      {section === "account" ? <SettingsAccountSkeleton /> : null}
    </>
  );
}

function adminSectionFromPath(path: string): AdminSkeletonSection {
  if (path.startsWith("/admin/departments")) {
    return "departments";
  }

  if (path.startsWith("/admin/reports")) {
    return "reports";
  }

  return "team";
}

function settingsSectionFromHash(
  hash: string,
): "account" | "integrations" | "company" {
  if (hash === "integrations") {
    return "integrations";
  }

  if (hash === "company") {
    return "company";
  }

  return "account";
}

export function loadingKindFromHref(
  href: string,
  fallbackVariant: "employee" | "reviewer" | "admin" = "employee",
): PageLoadingKind {
  const [pathPart, hashPart = ""] = href.split("#");
  const path = pathPart.split("?")[0] || "/";

  if (path.startsWith("/admin") || path.endsWith("/employees")) {
    const section = adminSectionFromPath(path);

    if (section === "departments") {
      return "admin-departments";
    }

    if (section === "reports") {
      return "admin-reports";
    }

    return "admin-team";
  }

  if (path.endsWith("/reports")) {
    return "reports";
  }

  if (path.endsWith("/review")) {
    return "review";
  }

  if (path.endsWith("/bugs")) {
    return "bugs";
  }

  if (path.endsWith("/account")) {
    return "settings-account";
  }

  if (path.endsWith("/settings")) {
    const section = settingsSectionFromHash(hashPart.split("?")[0]);

    if (section === "integrations") {
      return "settings-integrations";
    }

    if (section === "company") {
      return "settings-company";
    }

    return "settings-account";
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
  const adminSection =
    kind === "admin-departments"
      ? "departments"
      : kind === "admin-reports"
        ? "reports"
        : "team";
  const settingsSection =
    kind === "settings-integrations"
      ? "integrations"
      : kind === "settings-company"
        ? "company"
        : "account";

  return (
    <main
      className="reference-page min-[1024px]:flex min-[1024px]:h-full min-[1024px]:min-h-0 min-[1024px]:flex-col min-[1024px]:overflow-hidden"
      aria-busy="true"
      aria-label="Loading page"
    >
      {kind === "daily" ? <DailySkeleton /> : null}
      {kind === "reports" ? <ReportsSkeleton /> : null}
      {kind === "review" ? <ReviewSkeleton /> : null}
      {kind === "admin" || kind.startsWith("admin-") ? (
        <AdminSkeleton section={adminSection} />
      ) : null}
      {kind === "bugs" ? <BugsSkeleton /> : null}
      {kind === "settings" || kind.startsWith("settings-") ? (
        <SettingsSkeleton section={settingsSection} />
      ) : null}
    </main>
  );
}
