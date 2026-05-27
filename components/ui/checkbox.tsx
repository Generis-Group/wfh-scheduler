import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, disabled, ...props }, ref) => (
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
      className="pointer-events-none flex h-full w-full items-center justify-center rounded-[6px] bg-white text-white ring-1 ring-[#cbd5e1] transition-colors peer-checked:bg-[#2563eb] peer-checked:ring-[#2563eb] peer-focus-visible:ring-2 peer-focus-visible:ring-[#2563eb] peer-focus-visible:ring-offset-2 peer-disabled:bg-[#f1f5f9] dark:bg-[#0b1523] dark:ring-[#3a506d] dark:peer-checked:bg-[#3b82f6] dark:peer-checked:ring-[#60a5fa] peer-checked:[&_svg]:opacity-100"
    >
      <Check className="h-3.5 w-3.5 opacity-0 transition-opacity" />
    </span>
  </span>
));
Checkbox.displayName = "Checkbox";
