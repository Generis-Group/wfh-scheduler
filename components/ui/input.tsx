import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-[8px] border border-transparent bg-[hsl(var(--field))] px-3 py-2 text-sm text-foreground shadow-[inset_0_1px_1px_rgba(15,23,42,0.025),0_1px_2px_rgba(15,23,42,0.035)] ring-1 ring-input ring-offset-background transition-[background-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[hsl(var(--field))] dark:ring-input",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";
