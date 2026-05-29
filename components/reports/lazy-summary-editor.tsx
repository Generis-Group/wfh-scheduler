"use client";

import dynamic from "next/dynamic";
import { forwardRef, type Ref } from "react";

import {
  type SummaryEditorHandle,
  type SummaryEditorProps,
} from "@/components/reports/summary-editor";
import { Skeleton } from "@/components/ui/skeleton";

type LazySummaryEditorProps = SummaryEditorProps & {
  forwardedRef?: Ref<SummaryEditorHandle>;
};

const DynamicSummaryEditor = dynamic(
  () =>
    import("@/components/reports/summary-editor").then((module) => {
      const Component = module.SummaryEditor;
      const LoadedSummaryEditor = ({
        forwardedRef,
        ...props
      }: LazySummaryEditorProps) => <Component ref={forwardedRef} {...props} />;

      return LoadedSummaryEditor;
    }),
  {
    loading: () => <LazySummaryEditorSkeleton />,
    ssr: false,
  },
);

export const LazySummaryEditor = forwardRef<
  SummaryEditorHandle,
  SummaryEditorProps
>(function LazySummaryEditor(props, ref) {
  return <DynamicSummaryEditor {...props} forwardedRef={ref} />;
});

function LazySummaryEditorSkeleton() {
  return (
    <div className="mt-4 rounded-[10px] bg-[#f7f9fc] p-2 ring-1 ring-[#dfe4ee] dark:bg-[#0b1523] dark:ring-[#263a55]">
      <div
        className="summary-tiptap-editor"
        aria-busy="true"
        aria-label="Loading summary editor"
        role="status"
      >
        <div className="h-[480px] rounded-[7px] bg-white px-3.5 py-3.5 ring-1 ring-[#dfe4ee] dark:bg-[#0f1b2a] dark:ring-[#263a55]">
          <Skeleton className="h-4 w-11/12 rounded-[4px]" />
          <Skeleton className="mt-3 h-4 w-4/5 rounded-[4px]" />
          <Skeleton className="mt-3 h-4 w-9/12 rounded-[4px]" />
          <Skeleton className="mt-7 h-4 w-10/12 rounded-[4px]" />
          <Skeleton className="mt-3 h-4 w-7/12 rounded-[4px]" />
          <Skeleton className="mt-7 h-4 w-8/12 rounded-[4px]" />
        </div>
      </div>
    </div>
  );
}
