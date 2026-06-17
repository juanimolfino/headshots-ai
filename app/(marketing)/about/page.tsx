import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Database, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicPageMetadata, siteConfig } from "@/lib/seo";

export const metadata: Metadata = publicPageMetadata({
  title: `About ${siteConfig.name} | AI Headshots for Professionals`,
  description:
    `Learn what ${siteConfig.name} is, how the AI headshot workflow works, who it is built for, and how the company handles photo processing and support.`,
  path: "/about"
});

const workflow = [
  {
    title: "Upload reference photos",
    body: "Users upload a small set of selfies or reference photos so the system can understand facial structure, angles, and natural expression.",
    icon: Camera
  },
  {
    title: "Train a personal model",
    body: "A private AI workflow trains a model for that user, then the app uses credits to generate professional headshot variations.",
    icon: Database
  },
  {
    title: "Generate profile-ready images",
    body: "Users choose a style, background, and output settings, then download images for LinkedIn, resumes, websites, and business profiles.",
    icon: Sparkles
  },
  {
    title: "Keep data controls visible",
    body: "The dashboard includes account deletion controls, signed access to generated files, and clear legal pages for privacy, refunds, cookies, and terms.",
    icon: ShieldCheck
  }
];

export default function AboutPage() {
  return (
    <main className="bg-bg text-ink">
      <section className="mx-auto max-w-5xl px-6 py-16 md:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">About</p>
        <div className="mt-5 grid gap-8 md:grid-cols-[1.1fr_.9fr] md:items-end">
          <div>
            <h1 className="font-serif text-5xl font-medium leading-[0.98] tracking-[-0.03em] md:text-6xl">
              {siteConfig.name} helps professionals create headshots without a photo shoot.
            </h1>
          </div>
          <div className="space-y-5 text-base leading-7 text-ink-soft">
            <p>
              {siteConfig.name} is an AI headshot product built for people who need polished profile
              photos quickly: founders, job seekers, consultants, creators, students, and teams.
            </p>
            <p>
              The product solves a practical problem: professional headshots are useful, but studio
              sessions can be expensive, slow, and uncomfortable. The app turns user-provided photos
              into studio-style images with a guided model-training and generation workflow.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-5xl gap-6 px-6 py-12 md:grid-cols-4">
          {workflow.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-lg border border-line bg-bg p-5">
                <Icon className="h-5 w-5 text-navy" />
                <h2 className="mt-4 text-lg font-semibold text-ink">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{item.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-10 px-6 py-14 md:grid-cols-[.8fr_1fr]">
        <div>
          <h2 className="font-serif text-3xl font-medium tracking-[-0.02em]">Company information</h2>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            These details are also used by the public legal documents so users and crawlers can
            identify the operator behind the product.
          </p>
        </div>
        <dl className="grid gap-4 text-sm">
          <div className="rounded-lg border border-line bg-surface p-4">
            <dt className="font-semibold text-ink">Legal operator</dt>
            <dd className="mt-1 text-ink-soft">{siteConfig.legalName}</dd>
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <dt className="font-semibold text-ink">Business address</dt>
            <dd className="mt-1 text-ink-soft">{siteConfig.address}</dd>
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <dt className="font-semibold text-ink">Support</dt>
            <dd className="mt-1">
              <a className="font-semibold text-navy underline-offset-2 hover:underline" href={`mailto:${siteConfig.supportEmail}`}>
                {siteConfig.supportEmail}
              </a>
            </dd>
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <dt className="font-semibold text-ink">Privacy contact</dt>
            <dd className="mt-1">
              <a className="font-semibold text-navy underline-offset-2 hover:underline" href={`mailto:${siteConfig.privacyEmail}`}>
                {siteConfig.privacyEmail}
              </a>
            </dd>
          </div>
        </dl>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="rounded-lg border border-line bg-navy px-6 py-7 text-navy-foreground md:flex md:items-center md:justify-between">
          <div>
            <h2 className="font-serif text-3xl font-medium tracking-[-0.02em]">Ready to create profile photos?</h2>
            <p className="mt-2 text-sm text-navy-foreground/75">
              Compare plans, credits, and model training options before you start.
            </p>
          </div>
          <Button asChild variant="pillGold" size="pill" className="mt-5 md:mt-0">
            <Link href="/pricing">View pricing</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
