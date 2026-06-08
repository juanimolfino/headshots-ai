import * as React from "react";
import { cn } from "@/lib/utils";

// Panel navy full-width, texto claro, radio 26px (clase .panel-navy en globals.css).
// Los <h1..h3> internos toman --navy-foreground y los .eyebrow se aclaran solos.
// forwardRef para poder usarlo como elemento de <Reveal as={NavyPanel}>.
export const NavyPanel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("panel-navy", className)} {...props} />
  )
);
NavyPanel.displayName = "NavyPanel";
