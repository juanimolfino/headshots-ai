import { describe, expect, it } from "vitest";
import {
  BLUE_PACKS,
  CREDIT_PACKS,
  GOLD_PACKS,
  SUBSCRIPTION_PLANS,
  getCreditPack,
  getSubscriptionPlan,
  parseStripeCreditGrant
} from "@/lib/stripe/pricing";

describe("pricing config", () => {
  it("defines the eight Stripe prices from the pricing spec", () => {
    expect(SUBSCRIPTION_PLANS).toHaveLength(3);
    expect(BLUE_PACKS).toHaveLength(3);
    expect(GOLD_PACKS).toHaveLength(2);
    expect(CREDIT_PACKS).toHaveLength(5);

    expect(SUBSCRIPTION_PLANS.map((plan) => plan.stripePriceEnv)).toEqual([
      "STRIPE_PRICE_ID_SUB_LITE",
      "STRIPE_PRICE_ID_SUB_PRO",
      "STRIPE_PRICE_ID_SUB_STUDIO"
    ]);
    expect(CREDIT_PACKS.every((pack) => pack.price >= 4.99)).toBe(true);
  });

  it("finds plans and packs by public id", () => {
    expect(getSubscriptionPlan("pro")?.blue).toBe(70);
    expect(getCreditPack("blue_popular")?.blue).toBe(70);
    expect(getCreditPack("gold_triple")?.gold).toBe(3);
    expect(getCreditPack("missing")).toBeUndefined();
  });

  it("parses Stripe price metadata grants", () => {
    expect(parseStripeCreditGrant({
      kind: "subscription",
      grants_blue: "70",
      grants_gold: "2"
    })).toEqual({ kind: "subscription", blue: 70, gold: 2 });

    expect(parseStripeCreditGrant({
      kind: "pack",
      grants_blue: "0",
      grants_gold: "3"
    })).toEqual({ kind: "pack", blue: 0, gold: 3 });

    expect(parseStripeCreditGrant({ kind: "credits", grants_blue: "10", grants_gold: "0" })).toBeNull();
  });
});
