"use client";

import { useState } from "react";
import { FAQ } from "@/lib/content";

// Renders the refund answer with a linked email; plain text otherwise.
function Answer({ text }: { text: string }) {
  const email = "hello@headshotly.pro";
  if (!text.includes(email)) return <p>{text}</p>;
  const [before, after] = text.split(email);
  return (
    <p>
      {before}
      <a href={`mailto:${email}`}>{email}</a>
      {after}
    </p>
  );
}

export function Faq() {
  // Single-open accordion; first item open by default.
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="faq-wrap">
      <div className="faq">
        {FAQ.map((item, i) => (
          <details
            key={item.q}
            open={openIndex === i}
            onToggle={(e) => {
              // Keep React state in sync with the native toggle, single-open.
              const isOpen = (e.target as HTMLDetailsElement).open;
              if (isOpen) setOpenIndex(i);
              else if (openIndex === i) setOpenIndex(null);
            }}
          >
            <summary>
              <h3 style={{ font: "inherit", margin: 0 }}>{item.q}</h3>
              <span className="mk" aria-hidden="true" />
            </summary>
            <div className="ans">
              <Answer text={item.a} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
