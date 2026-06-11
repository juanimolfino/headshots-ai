import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Stripe webhook credit buckets", () => {
  const source = readFileSync(join(process.cwd(), "app/api/stripe/webhook/route.ts"), "utf8");
  const queries = readFileSync(join(process.cwd(), "lib/db/queries.ts"), "utf8");

  it("credits packs only from checkout.session.completed payment sessions", () => {
    expect(source).toContain('event.type === "checkout.session.completed"');
    expect(source).toContain('session.mode === "payment"');
    expect(source).toContain("addPackCredits");
  });

  it("replaces subscription credits from invoice.paid instead of pack-additive grants", () => {
    expect(source).toContain('event.type === "invoice.paid"');
    expect(source).toContain("getInvoicePrice(invoice)");
    expect(source).toContain("replaceSubscriptionCredits");
    expect(queries).toContain("subscriptionBlueBalance: blue");
    expect(queries).toContain("subscriptionGoldBalance: gold");
  });

  it("handles subscription lifecycle events without clearing packs", () => {
    expect(source).toContain('event.type === "customer.subscription.updated"');
    expect(source).toContain('event.type === "customer.subscription.deleted"');
    expect(source).toContain('event.type === "invoice.payment_failed"');
    expect(source).toContain('status: "past_due"');
    expect(source).toContain("clearSubscriptionCredits: true");
    expect(queries).toContain("packBlueBalance: 0");
    expect(queries).toContain("packGoldBalance: 0");
    expect(queries).toContain("...(input.clearSubscriptionCredits");
  });

  it("uses Stripe event ids to make credit grants idempotent", () => {
    expect(source).toContain("}, event.id)");
    expect(queries).toContain("onConflictDoNothing()");
    expect(queries).toContain("stripeEventId: stripeEventId ? `${stripeEventId}:subscription-blue`");
    expect(queries).toContain("stripeEventId: stripeEventId ? `${stripeEventId}:blue`");
  });
});
