"use client";

/**
 * HeroTransform — animated hero visual for headshotly.pro.
 *
 * Loops through 3 phases on an ~8.2s cycle:
 *   1. input      (2.6s) — messy collage of the user's selfies (tilted cards)
 *   2. processing (1.7s) — collage collapses, a gold scan sweep passes
 *   3. output     (3.9s) — resolves into the 4 result headshots (2x2 grid)
 * …then loops. Pauses when the tab is hidden. Under prefers-reduced-motion it
 * jumps straight to the output state with no motion.
 *
 * All visual work lives in hero-transform.css. This component only toggles the
 * phase class on the root and swaps the status text — same state machine as the
 * vanilla reference, ported to React.
 *
 * Setup:
 *   1. Copy ../images/sel-*.jpg into /public/hero/
 *   2. import "./hero-transform.css" (or convert to a CSS module)
 *   3. Render <HeroTransform /> in the right column of the hero (.hero-visual)
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

/* INPUT collage — 6 tilted cards. left/top position them, --r is the tilt. */
const INPUT = [
  { src: "/hero/sel-4.jpg",  style: { left: "2%",  top: "4%",  "--r": "-8deg" } },
  { src: "/hero/sel-5.jpg",  style: { left: "43%", top: "0%",  "--r": "6deg"  } },
  { src: "/hero/sel-6.jpg",  style: { left: "6%",  top: "39%", "--r": "5deg"  } },
  { src: "/hero/sel-9.jpg",  style: { left: "47%", top: "43%", "--r": "-6deg" } },
  { src: "/hero/sel-2.jpg",  style: { left: "25%", top: "20%", "--r": "-2deg" } },
  { src: "/hero/sel-10.jpg", style: { left: "30%", top: "50%", "--r": "9deg"  } },
] as const;

/* OUTPUT grid — 4 results. `style` picks the CSS filter look; `pos` frames the face. */
const OUTPUT = [
  { src: "/hero/sel-1.jpg", style: "pro",  cap: "Professional", pos: "50% 20%" },
  { src: "/hero/sel-8.jpg", style: "cine", cap: "Cinematic",    pos: "70% 30%" },
  { src: "/hero/sel-3.jpg", style: "nat",  cap: "Natural",      pos: "50% 34%" },
  { src: "/hero/sel-7.jpg", style: "pro",  cap: "Professional", pos: "33% 30%" },
] as const;

const PHASES = [
  { cls: "is-input",      t: 2600, txt: "12 selfies uploaded" },
  { cls: "is-processing", t: 1700, txt: "Training your model…" },
  { cls: "is-output",     t: 3900, txt: "Your headshots are ready" },
] as const;

export function HeroTransform() {
  const [i, setI] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setI(2); return; } // jump to output, no loop

    timer.current = setTimeout(
      () => setI((p) => (p + 1) % PHASES.length),
      PHASES[i].t
    );
    return () => clearTimeout(timer.current);
  }, [i]);

  // pause when the tab is hidden, resume on return
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) clearTimeout(timer.current);
      else setI((p) => p); // re-trigger the effect above
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const phase = PHASES[i].cls;
  return (
    <div
      className={`hsx ${phase}`}
      data-phase={phase}
      role="group"
      aria-label="Animation: from your everyday selfies to studio-quality AI headshots"
    >
      <div className="hsx-stage">
        <div className="hsx-input" aria-hidden>
          {INPUT.map((c, n) => (
            <div key={n} className="hsx-card" style={c.style as React.CSSProperties}>
              <Image src={c.src} alt="" fill sizes="240px" style={{ objectFit: "cover" }} />
            </div>
          ))}
        </div>

        <div className="hsx-output" aria-hidden>
          {OUTPUT.map((s, n) => (
            <figure key={n} className="hsx-shot" data-style={s.style}>
              <Image
                src={s.src}
                alt={`${s.cap} AI headshot`}
                fill
                sizes="220px"
                style={{ objectFit: "cover", objectPosition: s.pos }}
              />
              <figcaption className="hsx-cap">{s.cap}</figcaption>
            </figure>
          ))}
        </div>

        <div className="hsx-scan" aria-hidden />
      </div>

      <div className="hsx-status">
        <span className="hsx-dot" />
        <span className="hsx-status-txt">{PHASES[i].txt}</span>
      </div>
    </div>
  );
}
