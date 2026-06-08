import * as React from "react";
import { cn } from "@/lib/utils";

interface CreditDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** blue = generar imágenes · gold = entrenar modelo. */
  tone: "blue" | "gold";
}

// Punto de crédito decorativo (clase .cdot + data-tone en globals.css).
export function CreditDot({ tone, className, ...props }: CreditDotProps) {
  return <span className={cn("cdot", className)} data-tone={tone} aria-hidden="true" {...props} />;
}
