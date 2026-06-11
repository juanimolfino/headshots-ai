export type CreditBalanceSnapshot = {
  subscriptionBlueBalance: number;
  subscriptionGoldBalance: number;
  packBlueBalance: number;
  packGoldBalance: number;
  subscriptionCurrentPeriodEnd: Date | string | null;
  subscriptionStatus: string;
};

export type CreditBucket = "subscription" | "pack";
export type CreditColor = "blue" | "gold";

export type CreditDebit = {
  bucket: CreditBucket;
  credits: number;
};

function toDate(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export function hasUsableSubscriptionCredits(row: CreditBalanceSnapshot, now = new Date()) {
  if (row.subscriptionStatus !== "active") return false;
  const periodEnd = toDate(row.subscriptionCurrentPeriodEnd);
  return !periodEnd || periodEnd >= now;
}

export function getUsableCreditTotals(row: CreditBalanceSnapshot, now = new Date()) {
  const includeSubscription = hasUsableSubscriptionCredits(row, now);
  return {
    blue: row.packBlueBalance + (includeSubscription ? row.subscriptionBlueBalance : 0),
    gold: row.packGoldBalance + (includeSubscription ? row.subscriptionGoldBalance : 0),
    subscriptionBlue: includeSubscription ? row.subscriptionBlueBalance : 0,
    subscriptionGold: includeSubscription ? row.subscriptionGoldBalance : 0,
    packBlue: row.packBlueBalance,
    packGold: row.packGoldBalance
  };
}

export function planCreditDebit(
  row: CreditBalanceSnapshot,
  color: CreditColor,
  creditsNeeded: number,
  now = new Date()
): CreditDebit[] {
  const needed = Math.max(0, Math.trunc(creditsNeeded));
  if (needed === 0) return [];

  const totals = getUsableCreditTotals(row, now);
  const subscriptionAvailable = color === "gold" ? totals.subscriptionGold : totals.subscriptionBlue;
  const packAvailable = color === "gold" ? totals.packGold : totals.packBlue;
  if (subscriptionAvailable + packAvailable < needed) throw new Error("INSUFFICIENT_CREDITS");

  const subscriptionSpend = Math.min(subscriptionAvailable, needed);
  const packSpend = needed - subscriptionSpend;
  return [
    subscriptionSpend > 0 ? { bucket: "subscription" as const, credits: subscriptionSpend } : null,
    packSpend > 0 ? { bucket: "pack" as const, credits: packSpend } : null
  ].filter((debit): debit is CreditDebit => Boolean(debit));
}
