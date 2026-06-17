"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/**
 * Reveal is progressive enhancement: content is visible in server HTML and only
 * receives the hidden animation state after the client hydrates.
 */
export function Reveal({
  children,
  as: Tag = "div",
  delay,
  className = "",
}: {
  children: ReactNode;
  as?: ElementType;
  delay?: 1 | 2 | 3;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    el.classList.add("ready");

    // Above the fold content should become visible immediately after hydration.
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (r.top < vh && r.bottom > 0) {
      const t = globalThis.setTimeout(() => setShown(true), 0);
      return () => globalThis.clearTimeout(t);
    }

    if (!("IntersectionObserver" in window)) {
      const t = globalThis.setTimeout(() => setShown(true), 0);
      return () => globalThis.clearTimeout(t);
    }

    let fired = false;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            fired = true;
            setShown(true);
            io.disconnect();
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    io.observe(el);

    // Safety net if the observer never reports.
    const t = window.setTimeout(() => {
      if (!fired) setShown(true);
    }, 700);

    return () => {
      io.disconnect();
      window.clearTimeout(t);
    };
  }, [shown]);

  const Comp = Tag as any;
  const delayClass = delay ? ` d${delay}` : "";
  return (
    <Comp ref={ref} className={`reveal${delayClass} ${className}${shown ? " in" : ""}`}>
      {children}
    </Comp>
  );
}
