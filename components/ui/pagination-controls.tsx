"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Select } from "@/components/ui/select";
import { paginationPageSizeOptions } from "@/lib/pagination";
import { cn } from "@/lib/utils";

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  pageSizeOptions?: number[];
  pageSizeMenuPlacement?: "bottom" | "top";
  itemLabel?: string;
  className?: string;
  isLoading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function PaginationControls({
  page,
  pageSize,
  totalItems,
  pageSizeOptions = [...paginationPageSizeOptions],
  pageSizeMenuPlacement = "bottom",
  itemLabel = "items",
  className,
  isLoading = false,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  const normalizedPageSize = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(totalItems / normalizedPageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const uniquePageSizeOptions = Array.from(
    new Set([...pageSizeOptions, normalizedPageSize]),
  ).sort((first, second) => first - second);
  const pageItems = visiblePageItems(currentPage, pageCount);

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-end gap-x-7 gap-y-2 text-sm text-[#555] dark:text-muted-foreground",
        className,
      )}
      aria-label={`${itemLabel} pagination`}
      aria-busy={isLoading}
    >
      <span
        className={cn(
          "inline-flex h-[34px] min-w-[86px] items-center justify-end gap-1.5 text-xs font-semibold text-[#2563eb] transition-opacity dark:text-[#93c5fd]",
          isLoading ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        role={isLoading ? "status" : undefined}
        aria-live="polite"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading
      </span>
      <label className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-sm text-[#64748b] dark:text-muted-foreground">
          Rows
        </span>
        <Select
          aria-label="Rows per page"
          className="h-[34px] w-[74px] rounded-[8px] bg-white text-sm dark:bg-[hsl(var(--field))] [&_button]:px-2.5 [&_button]:text-left"
          disabled={isLoading}
          menuPlacement={pageSizeMenuPlacement}
          value={String(normalizedPageSize)}
          onChange={(event) => {
            const nextSize = Number.parseInt(event.currentTarget.value, 10);

            if (Number.isFinite(nextSize)) {
              onPageSizeChange(nextSize);
            }
          }}
        >
          {uniquePageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </label>

      <nav
        className="flex items-center gap-1"
        aria-label={`${itemLabel} pages`}
      >
        <button
          type="button"
          className="grid h-[34px] min-w-[34px] place-items-center rounded-[8px] border-0 bg-transparent p-0 text-[#555] transition-colors hover:bg-[#eee] hover:text-[#111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:cursor-not-allowed disabled:opacity-45 dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground"
          disabled={isLoading || currentPage === 1}
          aria-label="Previous page"
          title="Previous page"
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pageItems.map((item) =>
          item.type === "dots" ? (
            <span
              key={item.key}
              className="grid h-[34px] min-w-[34px] place-items-center rounded-[8px] text-[#aaa] dark:text-muted-foreground/70"
              aria-hidden="true"
            >
              ...
            </span>
          ) : (
            <button
              key={item.page}
              type="button"
              className={cn(
                "h-[34px] min-w-[34px] rounded-[8px] px-2 text-sm font-medium text-[#555] transition-colors hover:bg-[#eee] hover:text-[#111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:cursor-not-allowed disabled:opacity-60 dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground",
                item.page === currentPage &&
                  "bg-[#0b0b0b] text-white hover:bg-[#0b0b0b] hover:text-white dark:bg-[#020617] dark:text-white dark:hover:bg-[#020617] dark:hover:text-white",
              )}
              disabled={isLoading || item.page === currentPage}
              aria-current={item.page === currentPage ? "page" : undefined}
              aria-label={
                item.page === currentPage
                  ? `Page ${item.page}`
                  : `Go to page ${item.page}`
              }
              onClick={() => onPageChange(item.page)}
            >
              {item.page}
            </button>
          ),
        )}

        <button
          type="button"
          className="grid h-[34px] min-w-[34px] place-items-center rounded-[8px] border-0 bg-transparent p-0 text-[#555] transition-colors hover:bg-[#eee] hover:text-[#111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:cursor-not-allowed disabled:opacity-45 dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground"
          disabled={isLoading || currentPage === pageCount}
          aria-label="Next page"
          title="Next page"
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}

type PageItem =
  | {
      type: "page";
      page: number;
    }
  | {
      type: "dots";
      key: string;
    };

function visiblePageItems(currentPage: number, pageCount: number): PageItem[] {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => ({
      type: "page",
      page: index + 1,
    }));
  }

  if (currentPage <= 3) {
    return [
      { type: "page", page: 1 },
      { type: "page", page: 2 },
      { type: "page", page: 3 },
      { type: "dots", key: "end-dots" },
      { type: "page", page: pageCount },
    ];
  }

  if (currentPage >= pageCount - 2) {
    return [
      { type: "page", page: 1 },
      { type: "dots", key: "start-dots" },
      { type: "page", page: pageCount - 2 },
      { type: "page", page: pageCount - 1 },
      { type: "page", page: pageCount },
    ];
  }

  return [
    { type: "page", page: 1 },
    { type: "dots", key: "start-dots" },
    { type: "page", page: currentPage },
    { type: "dots", key: "end-dots" },
    { type: "page", page: pageCount },
  ];
}
