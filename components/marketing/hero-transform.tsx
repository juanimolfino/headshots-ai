"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";

const INPUT = [
  { src: "/hero/sel-4.jpg", style: { left: "2%", top: "4%", "--r": "-8deg" } },
  { src: "/hero/sel-5.jpg", style: { left: "43%", top: "0%", "--r": "6deg" } },
  { src: "/hero/sel-6.jpg", style: { left: "6%", top: "39%", "--r": "5deg" } },
  { src: "/hero/sel-9.jpg", style: { left: "47%", top: "43%", "--r": "-6deg" } },
  { src: "/hero/sel-2.jpg", style: { left: "25%", top: "20%", "--r": "-2deg" } },
  { src: "/hero/sel-10.jpg", style: { left: "30%", top: "50%", "--r": "9deg" } }
] as const;

const OUTPUT = [
  { src: "/images-landing-page/result/professional-image-example.jpg", style: "pro", cap: "Professional", pos: "50% 20%" },
  { src: "/images-landing-page/result/natural-image-example.jpg", style: "nat", cap: "Natural", pos: "50% 34%" },
  { src: "/images-landing-page/result/free-image-example.jpg", style: "free", cap: "Free", pos: "40% 28%" },
  { src: "/images-landing-page/result/cinematic-image-example.jpg", style: "cine", cap: "Cinematic", pos: "70% 30%" }
] as const;

const PHASES = [
  { cls: "is-input", t: 2600, txt: "12 selfies uploaded" },
  { cls: "is-processing", t: 1700, txt: "Training your model…" },
  { cls: "is-output", t: 3900, txt: "Your headshots are ready" }
] as const;

export function HeroTransform() {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      timer.current = setTimeout(() => setPhaseIndex(2), 0);
      return () => {
        if (timer.current) clearTimeout(timer.current);
      };
    }

    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };

    const schedule = () => {
      clear();
      if (document.hidden) return;
      timer.current = setTimeout(
        () => setPhaseIndex((current) => (current + 1) % PHASES.length),
        PHASES[phaseIndex].t
      );
    };

    const onVisibilityChange = () => {
      if (document.hidden) clear();
      else schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [phaseIndex]);

  const phase = PHASES[phaseIndex];

  return (
    <div
      className={`hsx ${phase.cls}`}
      data-phase={phase.cls}
      role="group"
      aria-label="Animation: from your everyday selfies to studio-quality AI headshots"
    >
      <div className="hsx-stage">
        <div className="hsx-input" aria-hidden="true">
          {INPUT.map((card, index) => (
            <div key={index} className="hsx-card" style={card.style as CSSProperties}>
              <Image src={card.src} alt="" fill sizes="240px" />
            </div>
          ))}
        </div>

        <div className="hsx-output" aria-hidden="true">
          {OUTPUT.map((shot, index) => (
            <figure key={index} className="hsx-shot" data-style={shot.style}>
              <Image
                src={shot.src}
                alt={`${shot.cap} AI headshot`}
                fill
                sizes="220px"
                style={{ objectPosition: shot.pos }}
              />
              <figcaption className="hsx-cap">{shot.cap}</figcaption>
            </figure>
          ))}
        </div>

        <div className="hsx-scan" aria-hidden="true" />
      </div>
      <div className="hsx-status">
        <span className="hsx-dot" />
        <span className="hsx-status-txt">{phase.txt}</span>
      </div>
    </div>
  );
}
