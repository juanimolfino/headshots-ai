import * as React from "react";
import { cn } from "@/lib/utils";

export interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

interface FaqProps extends React.HTMLAttributes<HTMLDivElement> {
  items: FaqItem[];
  /** Group name for native single-open behavior (<details name>). */
  name?: string;
  /** Default open item index. */
  defaultOpenIndex?: number;
}

// Native FAQ accordion. Full answer text stays in the DOM for crawlers and JSON-LD parity.
export function Faq({ items, name = "faq", defaultOpenIndex = 0, className, ...props }: FaqProps) {
  return (
    <div className={cn("faq", className)} {...props}>
      {items.map((item, i) => (
        <details key={item.question} name={name} open={i === defaultOpenIndex}>
          <summary>
            {/* h3 preserves heading semantics while inheriting the summary typography. */}
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
