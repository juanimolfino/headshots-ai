import { describe, expect, it } from "vitest";
import { getUsableCreditTotals, planCreditDebit, type CreditBalanceSnapshot } from "@/lib/db/credit-balances";

const future = new Date("2026-07-11T00:00:00.000Z");
const past = new Date("2026-05-11T00:00:00.000Z");
const now = new Date("2026-06-11T00:00:00.000Z");

function row(input: Partial<CreditBalanceSnapshot> = {}): CreditBalanceSnapshot {
  return {
    subscriptionBlueBalance: 10,
    subscriptionGoldBalance: 2,
    packBlueBalance: 30,
    packGoldBalance: 3,
    subscriptionCurrentPeriodEnd: future,
    subscriptionStatus: "active",
    ...input
  };
}

describe("credit bucket balances", () => {
  it("shows usable balance as subscription plus pack while subscription is active", () => {
    expect(getUsableCreditTotals(row(), now)).toMatchObject({
      blue: 40,
      gold: 5,
      subscriptionBlue: 10,
      subscriptionGold: 2,
      packBlue: 30,
      packGold: 3
    });
  });

  it("excludes subscription credits when the period has expired", () => {
    expect(getUsableCreditTotals(row({ subscriptionCurrentPeriodEnd: past }), now)).toMatchObject({
      blue: 30,
      gold: 3,
      subscriptionBlue: 0,
      subscriptionGold: 0
    });
  });

  it("excludes subscription credits when status is not active", () => {
    expect(getUsableCreditTotals(row({ subscriptionStatus: "past_due" }), now)).toMatchObject({
      blue: 30,
      gold: 3,
      subscriptionBlue: 0,
      subscriptionGold: 0
    });
  });

  it("spends subscription credits before permanent pack credits", () => {
    expect(planCreditDebit(row(), "blue", 12, now)).toEqual([
      { bucket: "subscription", credits: 10 },
      { bucket: "pack", credits: 2 }
    ]);
  });

  it("spends from pack only after cancellation makes subscription unusable", () => {
    expect(planCreditDebit(row({ subscriptionStatus: "canceled" }), "gold", 2, now)).toEqual([
      { bucket: "pack", credits: 2 }
    ]);
  });

  it("throws when combined usable credits are insufficient", () => {
    expect(() => planCreditDebit(row({ subscriptionStatus: "canceled" }), "gold", 4, now)).toThrow("INSUFFICIENT_CREDITS");
  });
});
