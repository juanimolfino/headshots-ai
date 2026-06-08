"use client";

import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { NAV_LINKS } from "@/lib/content";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header className={`nav${scrolled ? " scrolled" : ""}`}>
        <div className="wrap nav-inner">
          <a href="#top" aria-label="headshotly.pro home">
            <Logo />
          </a>
          <nav className="nav-links" aria-label="Primary">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="nav-cta">
            <a href="#pricing" className="btn btn-ghost btn-sm">
              Sign in
            </a>
            <a href="#pricing" className="btn btn-primary btn-sm">
              Get started
            </a>
            <button
              className="menu-btn"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <div className={`mobile-panel${open ? " open" : ""}`}>
        {NAV_LINKS.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
        <a href="#pricing" className="btn btn-primary" onClick={() => setOpen(false)}>
          Get started
        </a>
      </div>
    </>
  );
}
