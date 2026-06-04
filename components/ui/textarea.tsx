import * as React from "react";

import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-28 w-full rounded-[8px] border border-[#dfe5ef] bg-[hsl(var(--field))] px-3 py-2 text-sm leading-6 text-foreground shadow-none ring-0 ring-offset-background transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-[#93b4f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#263a55] dark:bg-[hsl(var(--field))]",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
