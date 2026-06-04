import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-10 w-full rounded-[8px] border border-[#dfe5ef] bg-[hsl(var(--field))] px-3 py-2 text-sm text-foreground shadow-none ring-0 ring-offset-background transition-[background-color,border-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:border-[#93b4f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#263a55] dark:bg-[hsl(var(--field))]",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";
