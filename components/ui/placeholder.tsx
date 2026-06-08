import * as React from "react";
import { cn } from "@/lib/utils";

interface PlaceholderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Texto corto del chip (data-label). */
  label: string;
  /** Descripción accesible (aria-label; futuro alt de next/image). */
  alt: string;
}

// Placeholder rayado con etiqueta. Accesible como imagen; al reemplazar por
// next/image, `alt` pasa a ser el alt y `label` el chip visible.
export function Placeholder({ label, alt, className, ...props }: PlaceholderProps) {
  return (
    <div
      className={cn("ph", className)}
      data-label={label}
      role="img"
      aria-label={alt}
      {...props}
    />
  );
}
