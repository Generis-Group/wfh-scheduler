"use client";

import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type FixedToastProps = {
  message: string | null;
  onDismiss: () => void;
  className?: string;
};

export function FixedToast({ message, onDismiss, className }: FixedToastProps) {
  if (!message) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 z-50 flex max-w-[min(420px,calc(100vw-2.5rem))] items-start gap-3 rounded-[12px] bg-white px-4 py-3 text-sm font-medium text-[#334155] shadow-[0_18px_42px_rgba(15,23,42,0.18)] ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:text-[#d7e0ec] dark:ring-[#263a55]",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[#64748b] transition-colors hover:bg-[#eef2f7] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground"
        aria-label="Dismiss message"
        onClick={onDismiss}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
