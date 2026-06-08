import * as React from "react";
import { cn } from "@/lib/utils";

export interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

interface FaqProps extends React.HTMLAttributes<HTMLDivElement> {
  items: FaqItem[];
  /** Nombre del grupo para el single-open nativo (<details name>). */
  name?: string;
  /** Índice del ítem abierto por defecto (primero por defecto). */
  defaultOpenIndex?: number;
}

// Accordion FAQ nativo: <details>/<summary>, single-open vía atributo `name`
// (sin JS). El texto completo de las respuestas queda en el DOM, listo para el
// JSON-LD FAQPage del Paso 5.
export function Faq({ items, name = "faq", defaultOpenIndex = 0, className, ...props }: FaqProps) {
  return (
    <div className={cn("faq", className)} {...props}>
      {items.map((item, i) => (
        <details key={item.question} name={name} open={i === defaultOpenIndex}>
          <summary>
            {/* h3 para SEO; font:inherit conserva el look serif del summary */}
            <h3 style={{ font: "inherit", margin: 0 }}>{item.question}</h3>
            <span className="mk" aria-hidden="true" />
          </summary>
          <div className="ans">
            <p>{item.answer}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
