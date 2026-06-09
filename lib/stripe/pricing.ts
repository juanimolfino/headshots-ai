export const SUBSCRIPTION_PLANS = [
  {
    id: "lite",
    name: "Lite",
    priceMonthly: 7.99,
    gold: 1,
    blue: 30,
    stripePriceEnv: "STRIPE_PRICE_ID_SUB_LITE",
    features: ["1 trained model per month", "30 blue credits per month", "Best value versus packs"]
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 14.99,
    gold: 2,
    blue: 70,
    stripePriceEnv: "STRIPE_PRICE_ID_SUB_PRO",
    features: ["2 trained models per month", "70 blue credits per month", "Priority generation queue"]
  },
  {
    id: "studio",
    name: "Studio",
    priceMonthly: 29.99,
    gold: 4,
    blue: 160,
    stripePriceEnv: "STRIPE_PRICE_ID_SUB_STUDIO",
    features: ["4 trained models per month", "160 blue credits per month", "Built for teams and frequent refreshes"]
  }
] as const;

export const BLUE_PACKS = [
  { id: "blue_starter", name: "Blue Starter", price: 4.99, blue: 30, gold: 0, stripePriceEnv: "STRIPE_PRICE_ID_BLUE_STARTER" },
  { id: "blue_popular", name: "Blue Popular", price: 11.49, blue: 70, gold: 0, stripePriceEnv: "STRIPE_PRICE_ID_BLUE_POPULAR" },
  { id: "blue_best_value", name: "Blue Best Value", price: 24.99, blue: 160, gold: 0, stripePriceEnv: "STRIPE_PRICE_ID_BLUE_BEST_VALUE" }
] as const;

export const GOLD_PACKS = [
  { id: "gold_single", name: "Gold Single", price: 4.99, blue: 0, gold: 1, stripePriceEnv: "STRIPE_PRICE_ID_GOLD_SINGLE" },
  { id: "gold_triple", name: "Gold Triple", price: 13.49, blue: 0, gold: 3, stripePriceEnv: "STRIPE_PRICE_ID_GOLD_TRIPLE" }
] as const;

export const CREDIT_PACKS = [...BLUE_PACKS, ...GOLD_PACKS] as const;
export const PLANS = SUBSCRIPTION_PLANS;

export type SubscriptionPlan = typeof SUBSCRIPTION_PLANS[number];
export type CreditPack = typeof CREDIT_PACKS[number];
export type StripeCreditGrant = {
  blue: number;
  gold: number;
  kind: "subscription" | "pack";
};

export function getSubscriptionPlan(id: string) {
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === id);
}

export function getCreditPack(id: string) {
  return CREDIT_PACKS.find((pack) => pack.id === id);
}

export function getPlanByStripePriceId(priceId: string | undefined) {
  if (!priceId) return undefined;
  return SUBSCRIPTION_PLANS.find((plan) => process.env[plan.stripePriceEnv] === priceId);
}

export function parseStripeCreditGrant(metadata: Record<string, string | undefined>): StripeCreditGrant | null {
  const kind = metadata.kind;
  if (kind !== "subscription" && kind !== "pack") return null;

  const blue = Number(metadata.grants_blue ?? 0);
  const gold = Number(metadata.grants_gold ?? 0);
  if (!Number.isFinite(blue) || !Number.isFinite(gold)) return null;

  return {
    blue: Math.max(0, Math.trunc(blue)),
    gold: Math.max(0, Math.trunc(gold)),
    kind
  };
}
