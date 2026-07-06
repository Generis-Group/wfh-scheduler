import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold leading-none ring-1 ring-transparent",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary ring-primary/15",
        secondary:
          "bg-secondary text-secondary-foreground ring-border dark:ring-white/[0.08]",
        outline:
          "bg-card text-foreground-muted ring-border dark:bg-white/[0.06] dark:text-foreground dark:ring-white/[0.08]",
        destructive:
          "bg-destructive/10 text-destructive ring-destructive/15",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
