import { Skeleton } from "@/components/ui/skeleton";

export function SummaryEditorToolbarSkeleton() {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-8 w-8 rounded-[8px]" />
      ))}
    </div>
  );
}

export function SummaryEditorBodySkeleton() {
  return (
    <div
      className="summary-tiptap-editor"
      aria-busy="true"
      aria-label="Loading summary editor"
      role="status"
    >
      <div className="summary-tiptap-skeleton-body">
        <Skeleton className="h-4 w-11/12 rounded-[4px]" />
        <Skeleton className="mt-3 h-4 w-4/5 rounded-[4px]" />
        <Skeleton className="mt-3 h-4 w-9/12 rounded-[4px]" />
        <Skeleton className="mt-7 h-4 w-10/12 rounded-[4px]" />
        <Skeleton className="mt-3 h-4 w-7/12 rounded-[4px]" />
        <Skeleton className="mt-7 h-4 w-8/12 rounded-[4px]" />
      </div>
    </div>
  );
}

export function SummaryEditorPanelSkeleton() {
  return (
    <div className="summary-tiptap-panel mt-4 rounded-[10px] bg-[#f7f9fc] p-2 ring-1 ring-[#dfe4ee] dark:bg-[#0b1523] dark:ring-[#263a55]">
      <SummaryEditorToolbarSkeleton />
      <SummaryEditorBodySkeleton />
    </div>
  );
}
