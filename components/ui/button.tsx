import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border bg-background hover:bg-muted",
        ghost: "hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // design system — CTAs pill (misma fuente de verdad, sin clase .btn paralela)
        pill: "group rounded-full bg-navy font-semibold tracking-[0.005em] text-navy-foreground hover:bg-navy-deep",
        pillGhost: "group rounded-full border border-line-strong bg-transparent font-semibold tracking-[0.005em] text-ink hover:border-ink",
        // design system — CTA gold del Pro card (hover #d6a948 encapsulado acá)
        pillGold: "group rounded-full bg-gold font-semibold tracking-[0.005em] text-gold-foreground hover:bg-[#d6a948]",
        // dashboard accent CTA
        sage: "bg-sage font-bold text-white shadow-[0_14px_28px_-16px_var(--sage)] hover:bg-sage-deep"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-5",
        // design system — paddings de los CTAs pill
        pill: "h-auto px-6 py-3.5 text-[15px]",
        pillSm: "h-auto px-[19px] py-[11px]"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

// Flecha animada para los CTAs pill. Funciona dentro de <Button> y de enlaces
// asChild (las variantes pill setean `group`); se desplaza 4px en hover.
function ButtonArrow({ className }: { className?: string }) {
  return (
    <ArrowRight
      aria-hidden="true"
      className={cn(
        "size-4 transition-transform duration-300 ease-soft group-hover:translate-x-1",
        className
      )}
    />
  );
}

export { Button, ButtonArrow, buttonVariants };
