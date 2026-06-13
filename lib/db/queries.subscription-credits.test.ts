import { describe, expect, it, vi } from "vitest";
import { credits, transactions } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  sendPurchaseConfirmationEmail: vi.fn(),
  sendWelcomeEmail: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  getDb: mocks.getDb
}));

vi.mock("@/lib/email/send", () => ({
  sendPurchaseConfirmationEmail: mocks.sendPurchaseConfirmationEmail,
  sendWelcomeEmail: mocks.sendWelcomeEmail
}));

import { replaceSubscriptionCredits, shouldApplySubscriptionLifecycleEvent } from "@/lib/db/queries";

function createSubscriptionCreditDb(transactionInserts: boolean[]) {
  const balances = {
    subscriptionBlueBalance: 0,
    subscriptionGoldBalance: 0,
    subscriptionCurrentPeriodEnd: null as Date | null,
    subscriptionStatus: "none"
  };
  const creditUpserts: unknown[] = [];
  const insertQueue = [...transactionInserts];

  const tx = {
    insert(table: unknown) {
      return {
        values(row: Record<string, unknown>) {
          return {
            onConflictDoNothing() {
              return {
                returning: async () => {
                  if (table !== transactions) return [];
                  return insertQueue.shift() ? [{ id: crypto.randomUUID() }] : [];
                }
              };
            },
            async onConflictDoUpdate() {
              if (table === credits) {
                creditUpserts.push(row);
                balances.subscriptionBlueBalance = row.subscriptionBlueBalance as number;
                balances.subscriptionGoldBalance = row.subscriptionGoldBalance as number;
                balances.subscriptionCurrentPeriodEnd = row.subscriptionCurrentPeriodEnd as Date | null;
                balances.subscriptionStatus = row.subscriptionStatus as string;
              }
            }
          };
        }
      };
    }
  };

  const db = {
    query: {
      users: {
        findFirst: vi.fn(async () => null)
      }
    },
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx))
  };

  mocks.getDb.mockReturnValue(db);
  return { balances, creditUpserts };
}

describe("replaceSubscriptionCredits", () => {
  it("sets subscription balances on the first invoice.paid", async () => {
    const { balances, creditUpserts } = createSubscriptionCreditDb([true, true]);
    const periodEnd = new Date("2026-07-01T00:00:00.000Z");

    const applied = await replaceSubscriptionCredits(
      "user_1",
      { blue: 30, gold: 1, currentPeriodEnd: periodEnd, status: "active" },
      { kind: "subscription", amountCents: 2900 },
      "evt_invoice_paid_1"
    );

    expect(applied).toBe(true);
    expect(creditUpserts).toHaveLength(1);
    expect(balances).toMatchObject({
      subscriptionBlueBalance: 30,
      subscriptionGoldBalance: 1,
      subscriptionCurrentPeriodEnd: periodEnd,
      subscriptionStatus: "active"
    });
  });

  it("does not reset spent subscription balances when invoice.paid is replayed", async () => {
    const { balances, creditUpserts } = createSubscriptionCreditDb([true, true, false, false]);

    await replaceSubscriptionCredits(
      "user_1",
      { blue: 30, gold: 1, currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"), status: "active" },
      { kind: "subscription", amountCents: 2900 },
      "evt_invoice_paid_1"
    );

    balances.subscriptionBlueBalance = 18;
    balances.subscriptionGoldBalance = 0;

    const replayApplied = await replaceSubscriptionCredits(
      "user_1",
      { blue: 30, gold: 1, currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"), status: "active" },
      { kind: "subscription", amountCents: 2900 },
      "evt_invoice_paid_1"
    );

    expect(replayApplied).toBe(false);
    expect(creditUpserts).toHaveLength(1);
    expect(balances).toMatchObject({
      subscriptionBlueBalance: 18,
      subscriptionGoldBalance: 0
    });
  });
});

describe("shouldApplySubscriptionLifecycleEvent", () => {
  it("discards subscription events older than the last applied event", () => {
    expect(shouldApplySubscriptionLifecycleEvent(
      {
        lastStripeEventId: "evt_newer",
        lastStripeEventCreatedAt: new Date("2026-06-13T10:00:00.000Z")
      },
      {
        stripeEventId: "evt_older",
        stripeEventCreatedAt: new Date("2026-06-13T09:59:59.000Z")
      }
    )).toBe(false);
  });

  it("makes replaying the same subscription event idempotent", () => {
    expect(shouldApplySubscriptionLifecycleEvent(
      {
        lastStripeEventId: "evt_subscription_update",
        lastStripeEventCreatedAt: new Date("2026-06-13T10:00:00.000Z")
      },
      {
        stripeEventId: "evt_subscription_update",
        stripeEventCreatedAt: new Date("2026-06-13T10:00:00.000Z")
      }
    )).toBe(false);
  });

  it("allows a newer subscription event to apply", () => {
    expect(shouldApplySubscriptionLifecycleEvent(
      {
        lastStripeEventId: "evt_old",
        lastStripeEventCreatedAt: new Date("2026-06-13T10:00:00.000Z")
      },
      {
        stripeEventId: "evt_new",
        stripeEventCreatedAt: new Date("2026-06-13T10:01:00.000Z")
      }
    )).toBe(true);
  });
});
