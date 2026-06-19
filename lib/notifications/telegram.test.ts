import { describe, expect, it } from "vitest";
import { buildSubscriptionMessage } from "@/lib/notifications/telegram";

describe("Telegram subscription alerts", () => {
  it("formats first-time subscription alerts with granted credits", () => {
    expect(buildSubscriptionMessage({
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      subscriptionType: "New subscription",
      itemName: "Pro",
      amountCents: 1499,
      currency: "usd",
      credits: { blue: 70, gold: 2 }
    })).toContain("New Stripe subscription");
    expect(buildSubscriptionMessage({
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      subscriptionType: "New subscription",
      itemName: "Pro",
      amountCents: 1499,
      currency: "usd",
      credits: { blue: 70, gold: 2 }
    })).toContain("Credits applied: 70 blue, 2 gold");
  });

  it("formats renewal alerts distinctly from first subscription alerts", () => {
    const message = buildSubscriptionMessage({
      customerEmail: "jane@example.com",
      subscriptionType: "Subscription renewal",
      itemName: "Lite",
      amountCents: 799,
      currency: "usd",
      credits: { blue: 30, gold: 1 }
    });

    expect(message).toContain("Stripe subscription renewed");
    expect(message).toContain("Plan: Lite");
    expect(message).toContain("Credits applied: 30 blue, 1 gold");
  });
});
