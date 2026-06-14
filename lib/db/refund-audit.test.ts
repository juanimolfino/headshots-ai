import { afterEach, describe, expect, it, vi } from "vitest";
import { credits, jobs, transactions } from "@/lib/db/schema";

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

import { REFUND_FALLBACK_NO_CREDIT_DEBITS, refundJobCredits } from "@/lib/db/queries";

function createRefundFallbackDb() {
  const job = {
    id: "job_legacy",
    userId: "user_1",
    type: "headshot-generate",
    status: "processing",
    metadata: {},
    creditsUsed: 4,
    creditKind: "blue"
  };
  const balances = {
    packBlueBalance: 0
  };
  let lastRefundTransaction: Record<string, unknown> | null = null;

  const tx = {
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              return {
                for: async () => (table === jobs ? [job] : [])
              };
            }
          };
        }
      };
    },
    insert(table: unknown) {
      return {
        values(row: Record<string, unknown>) {
          return {
            onConflictDoNothing() {
              return {
                returning: async () => {
                  if (table !== transactions) return [];
                  lastRefundTransaction = row;
                  return [{ id: "txn_refund" }];
                }
              };
            }
          };
        }
      };
    },
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            async where() {
              if (table === credits && lastRefundTransaction?.creditBucket === "pack") {
                balances.packBlueBalance += lastRefundTransaction.credits as number;
              }
              if (table === jobs) Object.assign(job, values);
            }
          };
        }
      };
    }
  };

  mocks.getDb.mockReturnValue({
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx))
  });

  return { balances, job };
}

describe("refundJobCredits legacy debit audit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a searchable structured warning when refunding without creditDebits metadata", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { balances, job } = createRefundFallbackDb();

    const refunded = await refundJobCredits(job.id, "test failure");

    expect(refunded).toBe(true);
    expect(balances.packBlueBalance).toBe(4);
    expect(warn).toHaveBeenCalledWith(
      REFUND_FALLBACK_NO_CREDIT_DEBITS,
      expect.objectContaining({
        code: REFUND_FALLBACK_NO_CREDIT_DEBITS,
        jobId: "job_legacy",
        userId: "user_1",
        jobType: "headshot-generate",
        creditKind: "blue",
        credits: 4
      })
    );
  });
});
