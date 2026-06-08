import * as React from "react";
import { cn } from "@/lib/utils";

interface PriceProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Monto, p. ej. "$5.90". */
  amount: string;
  /** Sufijo opcional, p. ej. "one-time" o "/mo". */
  suffix?: string;
}

// Precio serif grande + sufijo en sans (clase .price en globals.css).
export function Price({ amount, suffix, className, ...props }: PriceProps) {
  return (
    <div className={cn("price", className)} {...props}>
      {amount}
      {suffix ? <small>{suffix}</small> : null}
    </div>
  );
}
