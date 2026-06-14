import Link from "next/link";
import { CheckCircle2, CreditCard, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BLUE_PACKS, GOLD_PACKS, SUBSCRIPTION_PLANS } from "@/lib/stripe/pricing";

export const metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 text-ink">
      <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <h1 className="font-serif text-4xl font-medium tracking-[-0.02em] text-ink">Pricing</h1>
          <p className="mt-3 max-w-2xl text-ink-soft">
            Monthly plans include model training and image credits. Packs never expire.
          </p>
        </div>
        <Button asChild variant="pillGhost" size="pillSm">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const isPro = plan.id === "pro";
          return (
            <section
              key={plan.id}
              className={
                isPro
                  ? "relative rounded-plan border border-navy bg-navy p-8 text-navy-foreground"
                  : "rounded-plan border border-line bg-surface p-8"
              }
            >
              {isPro ? (
                <Badge variant="gold" className="absolute -top-3 left-8">
                  Most popular
                </Badge>
              ) : null}
              <h2 className="font-serif text-2xl font-medium">{plan.name}</h2>
              <p className="mt-2 font-serif text-5xl font-medium tracking-[-0.02em]">
                ${plan.priceMonthly}
                <span
                  className={
                    isPro
                      ? "ml-1 font-sans text-base text-navy-foreground/70"
                      : "ml-1 font-sans text-base text-ink-muted"
                  }
                >
                  /mo
                </span>
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <CheckCircle2
                      className={isPro ? "h-4 w-4 flex-none text-gold" : "h-4 w-4 flex-none text-navy"}
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <form action="/api/stripe/checkout" method="post" className="mt-6">
                <input type="hidden" name="mode" value="subscription" />
                <input type="hidden" name="planId" value={plan.id} />
                <Button type="submit" variant={isPro ? "pillGold" : "pill"} size="pill" className="w-full">
                  <CreditCard className="h-4 w-4" />
                  Subscribe to {plan.name}
                </Button>
                <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                  By continuing to checkout, you agree to our{" "}
                  <Link href="/terms" className="font-semibold text-navy underline-offset-2 hover:underline">Terms</Link>,{" "}
                  <Link href="/privacy" className="font-semibold text-navy underline-offset-2 hover:underline">Privacy Policy</Link>,{" "}
                  <Link href="/cookies" className="font-semibold text-navy underline-offset-2 hover:underline">Cookie Policy</Link>, and{" "}
                  <Link href="/refund-policy" className="font-semibold text-navy underline-offset-2 hover:underline">Refund Policy</Link>.
                </p>
              </form>
            </section>
          );
        })}
      </div>
      <h2 className="mt-12 font-serif text-2xl font-medium">Blue credit packs</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {BLUE_PACKS.map((pack) => (
          <section key={pack.id} className="rounded-plan border border-line bg-surface p-6">
            <h3 className="font-serif text-xl font-medium">{pack.blue} blue credits</h3>
            <p className="mt-2 font-serif text-4xl font-medium tracking-[-0.02em]">${pack.price}</p>
            <p className="mt-3 text-sm text-ink-soft">For generation and quick edits. Credits do not expire.</p>
              <form action="/api/stripe/checkout" method="post" className="mt-6">
              <input type="hidden" name="mode" value="pack" />
              <input type="hidden" name="packId" value={pack.id} />
              <Button type="submit" variant="pill" size="pill" className="w-full">
                <Wallet className="h-4 w-4" />
                Buy {pack.blue} blue
                </Button>
                <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                  By continuing to checkout, you agree to our{" "}
                  <Link href="/terms" className="font-semibold text-navy underline-offset-2 hover:underline">Terms</Link>,{" "}
                  <Link href="/privacy" className="font-semibold text-navy underline-offset-2 hover:underline">Privacy Policy</Link>,{" "}
                  <Link href="/cookies" className="font-semibold text-navy underline-offset-2 hover:underline">Cookie Policy</Link>, and{" "}
                  <Link href="/refund-policy" className="font-semibold text-navy underline-offset-2 hover:underline">Refund Policy</Link>.
                </p>
              </form>
          </section>
        ))}
      </div>
      <h2 className="mt-12 font-serif text-2xl font-medium">Gold credit packs</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {GOLD_PACKS.map((pack) => (
          <section key={pack.id} className="rounded-plan border border-line bg-surface p-6">
            <h3 className="font-serif text-xl font-medium">
              {pack.gold} gold {pack.gold === 1 ? "credit" : "credits"}
            </h3>
            <p className="mt-2 font-serif text-4xl font-medium tracking-[-0.02em]">${pack.price}</p>
            <p className="mt-3 text-sm text-ink-soft">For training personal LoRA models. Credits do not expire.</p>
              <form action="/api/stripe/checkout" method="post" className="mt-6">
              <input type="hidden" name="mode" value="pack" />
              <input type="hidden" name="packId" value={pack.id} />
              <Button type="submit" variant="pillGold" size="pill" className="w-full">
                <Wallet className="h-4 w-4" />
                Buy {pack.gold} gold
                </Button>
                <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                  By continuing to checkout, you agree to our{" "}
                  <Link href="/terms" className="font-semibold text-navy underline-offset-2 hover:underline">Terms</Link>,{" "}
                  <Link href="/privacy" className="font-semibold text-navy underline-offset-2 hover:underline">Privacy Policy</Link>,{" "}
                  <Link href="/cookies" className="font-semibold text-navy underline-offset-2 hover:underline">Cookie Policy</Link>, and{" "}
                  <Link href="/refund-policy" className="font-semibold text-navy underline-offset-2 hover:underline">Refund Policy</Link>.
                </p>
              </form>
          </section>
        ))}
      </div>
    </main>
  );
}
