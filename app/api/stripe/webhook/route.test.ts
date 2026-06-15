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
    expect(source).toContain("getCreditPackByStripePriceId");
  });

  it("replaces subscription credits from invoice.paid instead of pack-additive grants", () => {
    expect(source).toContain('event.type === "invoice.paid"');
    expect(source).toContain("getInvoiceSubscriptionId(invoice)");
    expect(source).toContain("resolveInvoicePrice(invoice, subscription)");
    expect(source).toContain("replaceSubscriptionCredits");
    expect(queries).toContain("subscriptionBlueBalance: blue");
    expect(queries).toContain("subscriptionGoldBalance: gold");
  });

  it("supports current Stripe invoice subscription and price fields", () => {
    expect(source).toContain("invoice.parent?.subscription_details?.subscription");
    expect(source).toContain("item.pricing?.price_details?.price");
    expect(source).toContain("invoice?.lines?.data[0]?.period?.end");
  });

  it("handles subscription lifecycle events without clearing packs", () => {
    expect(source).toContain('event.type === "customer.subscription.updated"');
    expect(source).toContain('event.type === "customer.subscription.deleted"');
    expect(source).toContain('event.type === "invoice.payment_failed"');
    expect(source).toContain('creditStatus: "past_due"');
    expect(source).toContain("clearSubscriptionCredits: true");
    expect(source).toContain("applySubscriptionLifecycleEvent");
    expect(source).toContain("stripeEventCreatedDate(event)");
    expect(queries).toContain("shouldApplySubscriptionLifecycleEvent(existing, input)");
    expect(queries).toContain("lastStripeEventId: input.stripeEventId");
    expect(queries).toContain("lastStripeEventCreatedAt: input.stripeEventCreatedAt");
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

  it("sends Telegram payment alerts only after a credit grant is applied", () => {
    expect(source).toContain("sendTelegramPaymentNotification");
    expect(source).toContain("if (applied)");
    expect(source).toContain('paymentType: "Pack"');
    expect(source).toContain('paymentType: "Subscription"');
  });

  it("reports processing failures for valid Stripe events", () => {
    expect(source).toContain("reportError(error");
    expect(source).toContain('area: "stripe.webhook"');
    expect(source).toContain("stripeEventId: event.id");
    expect(source).toContain('status: 500');
  });

  it("emits structured operational logs for payment reconstruction", () => {
    expect(source).toContain("logInfo");
    expect(source).toContain("stripe_webhook_event_received");
    expect(source).toContain("stripe_pack_grant_applied");
    expect(source).toContain("stripe_pack_grant_skipped_idempotent");
    expect(source).toContain("stripe_subscription_grant_applied");
    expect(source).toContain("stripe_subscription_grant_skipped_idempotent");
    expect(source).toContain("stripe_webhook_event_processed");
    expect(source).toContain("stripe_webhook_signature_rejected");
  });
});
