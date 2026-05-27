import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, disabled, ...props }, ref) => (
  <span
    className={cn(
      "relative flex h-10 w-full min-w-0 items-center rounded-[8px] bg-white text-sm font-medium text-[#111827] shadow-none ring-1 ring-[#dfe4ee] transition-colors focus-within:ring-2 focus-within:ring-[#2563eb] dark:bg-[#0b1523] dark:text-foreground dark:ring-[#263a55]",
      disabled && "cursor-not-allowed opacity-50",
      className,
    )}
  >
    <select
      className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-[inherit] border-0 bg-transparent py-0 pl-3 pr-10 text-inherit outline-none disabled:cursor-not-allowed"
      disabled={disabled}
      ref={ref}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-3 h-4 w-4 text-[#667085] dark:text-muted-foreground"
      aria-hidden="true"
    />
  </span>
));
Select.displayName = "Select";
