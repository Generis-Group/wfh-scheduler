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
        "fixed bottom-5 right-5 z-50 flex max-w-[min(420px,calc(100vw-2.5rem))] items-start gap-3 rounded-[12px] bg-white px-4 py-3 text-sm font-medium text-foreground-muted shadow-[0_18px_42px_rgba(15,23,42,0.18)] ring-1 ring-border dark:bg-card dark:text-foreground dark:ring-border",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground"
        aria-label="Dismiss message"
        onClick={onDismiss}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
