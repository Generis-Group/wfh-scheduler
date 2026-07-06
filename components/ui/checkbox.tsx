import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
    tone?: "default" | "danger";
  }
>(({ className, disabled, tone = "default", ...props }, ref) => (
  <span
    className={cn(
      "relative inline-flex h-5 w-5 shrink-0 items-center justify-center",
      disabled && "cursor-not-allowed opacity-50",
      className,
    )}
  >
    <input
      type="checkbox"
      className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 focus-visible:outline-none disabled:cursor-not-allowed"
      disabled={disabled}
      ref={ref}
      {...props}
    />
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none flex h-full w-full items-center justify-center rounded-md bg-card text-white ring-1 ring-border-strong transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-disabled:bg-muted dark:bg-background peer-checked:[&_svg]:opacity-100",
        tone === "danger"
          ? "peer-checked:bg-red-600 peer-checked:ring-red-600 peer-focus-visible:ring-red-500 dark:peer-checked:bg-red-500 dark:peer-checked:ring-red-400"
          : "peer-checked:bg-primary peer-checked:ring-primary peer-focus-visible:ring-primary",
      )}
    >
      <Check className="h-3.5 w-3.5 opacity-0 transition-opacity" />
    </span>
  </span>
));
Checkbox.displayName = "Checkbox";
