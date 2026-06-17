"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { NAV_LINKS } from "@/lib/landing-content";
import { siteConfig } from "@/lib/seo";

export function Nav({ authenticated = false }: { authenticated?: boolean }) {
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
          <a href={authenticated ? "/dashboard/headshots" : "#top"} aria-label={authenticated ? "Open dashboard" : `${siteConfig.name} home`}>
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
            {/* Sign in: oculto en mobile (≤760px), como .nav-cta .btn-ghost de la ref */}
            <Button asChild variant="pillGhost" size="pillSm" className="max-[760px]:hidden">
              <Link href={authenticated ? "/dashboard" : "/login"}>{authenticated ? "Dashboard" : "Sign in"}</Link>
            </Button>
            <Button asChild variant="pill" size="pillSm">
              <Link href={authenticated ? "/dashboard/headshots" : "/login"}>
                {authenticated ? "Open dashboard" : "Get started"}
              </Link>
            </Button>
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
          <a key={l.href} href={l.href} className="mp-link" onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
        <Button asChild variant="pill" size="pill" className="mt-[18px] w-full">
          <Link href={authenticated ? "/dashboard/headshots" : "/login"} onClick={() => setOpen(false)}>
            {authenticated ? "Open dashboard" : "Get started"}
          </Link>
        </Button>
      </div>
    </>
  );
}
