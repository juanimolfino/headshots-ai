import { describe, expect, it, vi } from "vitest";
import { credits, jobs, transactions, type CreditKind, type JobStatus, type JobType } from "@/lib/db/schema";

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

import { getStaleJobTimeoutReason, reapStaleJobs } from "@/lib/db/queries";

function createRefundDb(job: Record<string, unknown>, balances: {
  subscriptionBlueBalance: number;
  packBlueBalance: number;
}) {
  const refundTransactionIds = new Set<string>();
  let lastRefundTransaction: Record<string, unknown> | null = null;
  let transactionInsertCount = 0;

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
                  const stripeEventId = row.stripeEventId as string;
                  if (refundTransactionIds.has(stripeEventId)) return [];
                  refundTransactionIds.add(stripeEventId);
                  lastRefundTransaction = row;
                  transactionInsertCount += 1;
                  return [{ id: `txn_${transactionInsertCount}` }];
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
              if (table === credits && lastRefundTransaction) {
                if (lastRefundTransaction.creditKind === "blue" && lastRefundTransaction.creditBucket === "subscription") {
                  balances.subscriptionBlueBalance += lastRefundTransaction.credits as number;
                }
                if (lastRefundTransaction.creditKind === "blue" && lastRefundTransaction.creditBucket === "pack") {
                  balances.packBlueBalance += lastRefundTransaction.credits as number;
                }
              }
              if (table === jobs) {
                Object.assign(job, values);
              }
            }
          };
        }
      };
    }
  };

  mocks.getDb.mockReturnValue({
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx))
  });

  return {
    get transactionInsertCount() {
      return transactionInsertCount;
    }
  };
}

describe("stale job reaper", () => {
  it("identifies active jobs older than their timeout threshold", () => {
    const now = new Date("2026-06-13T12:00:00.000Z");
    expect(getStaleJobTimeoutReason({
      id: "job_1",
      type: "headshot-edit" as JobType,
      status: "processing",
      createdAt: new Date("2026-06-13T11:40:00.000Z")
    }, now)).toContain("timed out");

    expect(getStaleJobTimeoutReason({
      id: "job_2",
      type: "headshot-edit" as JobType,
      status: "processing",
      createdAt: new Date("2026-06-13T11:55:00.000Z")
    }, now)).toBeNull();
  });

  it("marks a stale job failed, refunds its original bucket, and does not refund twice", async () => {
    const now = new Date("2026-06-13T12:00:00.000Z");
    const job = {
      id: "job_1",
      userId: "user_1",
      type: "headshot-generate" as JobType,
      status: "processing" as JobStatus,
      createdAt: new Date("2026-06-13T11:30:00.000Z"),
      creditsUsed: 4,
      creditKind: "blue" as CreditKind,
      error: null as string | null,
      metadata: {
        creditDebits: [{ bucket: "subscription", credits: 4 }]
      }
    };
    const balances = {
      subscriptionBlueBalance: 0,
      packBlueBalance: 0
    };
    const db = createRefundDb(job, balances);
    const loadActiveJobs = async () => (
      job.status === "pending" || job.status === "processing"
        ? [{ id: job.id, type: job.type, status: job.status, createdAt: job.createdAt }]
        : []
    );

    const firstRun = await reapStaleJobs({ now, loadActiveJobs });
    const secondRun = await reapStaleJobs({ now, loadActiveJobs });

    expect(firstRun).toMatchObject({ checked: 1, reaped: 1 });
    expect(secondRun).toMatchObject({ checked: 0, reaped: 0 });
    expect(job.status).toBe("failed");
    expect(job.error).toContain("timed out");
    expect(balances).toEqual({
      subscriptionBlueBalance: 4,
      packBlueBalance: 0
    });
    expect(db.transactionInsertCount).toBe(1);
  });
});
