import { describe, expect, it, vi } from "vitest";
import { verifySubscriptionGrantIntegrity } from "@/lib/stripe/subscription-grant-integrity";

describe("verifySubscriptionGrantIntegrity", () => {
  it("reports an inconsistency when credited balances do not match the expected plan grant", async () => {
    const report = vi.fn().mockResolvedValue(undefined);

    const ok = await verifySubscriptionGrantIntegrity({
      userId: "user_123",
      userLabel: "jane@example.com",
      plan: "pro",
      stripeEventId: "evt_123",
      stripeEventType: "invoice.paid",
      subscriptionId: "sub_123",
      invoiceId: "in_123",
      priceId: "price_123",
      expectedCredits: { blue: 120, gold: 1 },
      actualCredits: { blue: 0, gold: 0 },
      report
    });

    expect(ok).toBe(false);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Stripe subscription payment and credited balances are inconsistent"
      }),
      expect.objectContaining({
        area: "stripe.webhook.subscription-grant-integrity",
        userId: "user_123",
        plan: "pro",
        stripeEventId: "evt_123",
        expectedCredits: { blue: 120, gold: 1 },
        actualCredits: { blue: 0, gold: 0 }
      })
    );
  });

  it("reports when a paid subscription invoice cannot be attributed to a user", async () => {
    const report = vi.fn().mockResolvedValue(undefined);

    const ok = await verifySubscriptionGrantIntegrity({
      userId: null,
      plan: "pro",
      stripeEventId: "evt_missing_user",
      stripeEventType: "invoice.paid",
      subscriptionId: "sub_missing_user",
      expectedCredits: { blue: 120, gold: 1 },
      actualCredits: null,
      report
    });

    expect(ok).toBe(false);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Stripe subscription payment could not be attributed to a user"
      }),
      expect.objectContaining({
        area: "stripe.webhook.subscription-grant-integrity",
        subscriptionId: "sub_missing_user",
        stripeEventId: "evt_missing_user",
        expectedCredits: { blue: 120, gold: 1 }
      })
    );
  });
});
