import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-10 items-center justify-center whitespace-nowrap rounded-[8px] text-sm font-semibold transition-[background-color,border-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_8px_18px_rgba(37,99,235,0.14)] hover:bg-primary/90 dark:shadow-[0_10px_24px_rgba(37,99,235,0.22)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-[#dfe5ef] bg-white text-[#344054] shadow-[0_1px_2px_rgba(15,23,42,0.035)] hover:border-[#cbd5e1] hover:bg-[#f8fafc] hover:text-[#111827] dark:border-[#263a55] dark:bg-white/[0.04] dark:text-foreground dark:hover:bg-white/[0.08]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-none hover:bg-secondary/80",
        ghost:
          "text-[#475569] hover:bg-[#f3f6fb] hover:text-[#111827] dark:text-muted-foreground dark:hover:bg-white/[0.08] dark:hover:text-foreground",
      },
      size: {
        default: "px-4 py-2",
        sm: "h-9 px-3",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
