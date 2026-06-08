"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/**
 * Reveal — fade/rise suave al entrar en viewport.
 * Robusto: lo que ya está en pantalla al montar se muestra de inmediato, y si el
 * IntersectionObserver nunca reporta (previews/embeds) se revela tras un timeout.
 * El contenido nunca queda oculto permanentemente. La clase `js` se setea por JS
 * (no estática), así sin JS no hay estado oculto y todo es visible.
 *
 * `delay` mapea a las clases d1/d2/d3 de globals.css.
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

    // Above-the-fold: revelar ya si está en vista.
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

    // Safety net si el observer nunca reporta.
    const t = window.setTimeout(() => {
      if (!fired) setShown(true);
    }, 700);

    return () => {
      io.disconnect();
      window.clearTimeout(t);
    };
  }, [shown]);

  // Polimórfico: `as any` evita la fricción de tipos de ref en ElementType.
  const Comp = Tag as any;
  const delayClass = delay ? ` d${delay}` : "";
  return (
    <Comp ref={ref} className={`reveal${delayClass} ${className}${shown ? " in" : ""}`}>
      {children}
    </Comp>
  );
}
