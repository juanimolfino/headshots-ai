import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium",
  {
    variants: {
      variant: {
        // idéntica al badge previo (no rompe job-history)
        default: "",
        // design system — badge "Most popular" del Pro card
        gold: "rounded-full border-0 bg-gold px-[13px] py-1.5 text-[11.5px] font-bold uppercase tracking-[0.07em] text-[#241c08]"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
