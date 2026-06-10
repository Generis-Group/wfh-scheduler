"use client";

import dynamic from "next/dynamic";
import { forwardRef, type Ref } from "react";

import {
  type SummaryEditorHandle,
  type SummaryEditorProps,
} from "@/components/reports/summary-editor";
import { SummaryEditorPanelSkeleton } from "@/components/reports/summary-editor-skeleton";

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
    loading: () => <SummaryEditorPanelSkeleton />,
    ssr: false,
  },
);

export const LazySummaryEditor = forwardRef<
  SummaryEditorHandle,
  SummaryEditorProps
>(function LazySummaryEditor(props, ref) {
  return <DynamicSummaryEditor {...props} forwardedRef={ref} />;
});
