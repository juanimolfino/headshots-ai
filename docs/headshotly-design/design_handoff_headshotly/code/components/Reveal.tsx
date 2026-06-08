"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reveal — gentle fade/rise as the element scrolls into view.
 * Robust: anything already on screen at mount shows immediately, and if the
 * IntersectionObserver never reports (some embedded/preview contexts) we reveal
 * after a short timeout. Content is never permanently hidden.
 *
 * `delay` maps to the d1/d2/d3 stagger classes from globals.css.
 */
export function Reveal({
  children,
  as: Tag = "div",
  delay,
  className = "",
}: {
  children: ReactNode;
  as?: keyof JSX.IntrinsicElements;
  delay?: 1 | 2 | 3;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;

    // Above-the-fold safety: reveal right away if already in view.
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
    <Comp
      ref={ref as any}
      className={`reveal${delayClass} ${className}${shown ? " in" : ""}`}
    >
      {children}
    </Comp>
  );
}
