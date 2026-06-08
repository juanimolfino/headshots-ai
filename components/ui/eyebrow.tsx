import * as React from "react";
import { cn } from "@/lib/utils";

// Label uppercase con línea de 22px (clase .eyebrow en globals.css).
export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("eyebrow", className)} {...props} />;
}
