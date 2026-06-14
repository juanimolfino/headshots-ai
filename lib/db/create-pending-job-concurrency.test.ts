import { describe, expect, it, vi } from "vitest";
import { credits, jobs, transactions, type CreditKind, type JobType } from "@/lib/db/schema";
import { planCreditDebit, type CreditBalanceSnapshot } from "@/lib/db/credit-balances";

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

import { createPendingJob } from "@/lib/db/queries";

class RowLock {
  private locked = false;
  private waiters: Array<() => void> = [];

  async acquire() {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release() {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.locked = false;
  }
}

function createConcurrentJobDb(input: {
  initialBalance: CreditBalanceSnapshot;
  jobCost: number;
  creditKind: CreditKind;
}) {
  const lock = new RowLock();
  const balance = { ...input.initialBalance };
  const jobRows: Array<Record<string, unknown>> = [];
  const transactionRows: Array<Record<string, unknown>> = [];

  function snapshot() {
    return { ...balance };
  }

  const db = {
    transaction: async (callback: (transaction: Record<string, unknown>) => Promise<unknown>) => {
      let acquired = false;
      const tx = {
        select() {
          return {
            from(table: unknown) {
              return {
                where() {
                  return {
                    for: async (mode: string) => {
                      if (table !== credits || mode !== "update") return [];
                      await lock.acquire();
                      acquired = true;
                      return [snapshot()];
                    }
                  };
                }
              };
            }
          };
        },
        update(table: unknown) {
          return {
            set() {
              return {
                where: async () => {
                  if (table !== credits) return;
                  const debits = planCreditDebit(balance, input.creditKind, input.jobCost);
                  const subscriptionDebit = debits.find((debit) => debit.bucket === "subscription")?.credits ?? 0;
                  const packDebit = debits.find((debit) => debit.bucket === "pack")?.credits ?? 0;

                  if (input.creditKind === "gold") {
                    balance.subscriptionGoldBalance -= subscriptionDebit;
                    balance.packGoldBalance -= packDebit;
                  } else {
                    balance.subscriptionBlueBalance -= subscriptionDebit;
                    balance.packBlueBalance -= packDebit;
                  }
                }
              };
            }
          };
        },
        insert(table: unknown) {
          return {
            values(row: Record<string, unknown>) {
              if (table === jobs) {
                return {
                  returning: async () => {
                    const job = {
                      id: `job_${jobRows.length + 1}`,
                      status: "pending",
                      ...row
                    };
                    jobRows.push(job);
                    return [job];
                  }
                };
              }

              if (table === transactions) {
                transactionRows.push(row);
              }

              return Promise.resolve();
            }
          };
        }
      };

      try {
        return await callback(tx);
      } finally {
        if (acquired) lock.release();
      }
    }
  };

  mocks.getDb.mockReturnValue(db);

  return {
    balance,
    jobRows,
    transactionRows
  };
}

async function createTwoParallelJobs() {
  return Promise.allSettled([
    createPendingJob({
      userId: "user_1",
      type: "headshot-generate" as JobType,
      payload: { prompt: "one" },
      creditsUsed: 4,
      creditKind: "blue"
    }),
    createPendingJob({
      userId: "user_1",
      type: "headshot-generate" as JobType,
      payload: { prompt: "two" },
      creditsUsed: 4,
      creditKind: "blue"
    })
  ]);
}

function expectOneSuccessAndOneInsufficientCreditFailure(results: PromiseSettledResult<unknown>[]) {
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect(rejected[0].reason).toBeInstanceOf(Error);
  expect((rejected[0].reason as Error).message).toBe("INSUFFICIENT_CREDITS");
}

describe("createPendingJob concurrency", () => {
  it("allows only one parallel job with pack balance for one job and never goes negative", async () => {
    const db = createConcurrentJobDb({
      jobCost: 4,
      creditKind: "blue",
      initialBalance: {
        subscriptionBlueBalance: 0,
        subscriptionGoldBalance: 0,
        packBlueBalance: 4,
        packGoldBalance: 0,
        subscriptionCurrentPeriodEnd: null,
        subscriptionStatus: "none"
      }
    });

    const results = await createTwoParallelJobs();

    expectOneSuccessAndOneInsufficientCreditFailure(results);
    expect(db.balance.packBlueBalance).toBe(0);
    expect(db.balance.subscriptionBlueBalance).toBe(0);
    expect(db.jobRows).toHaveLength(1);
    expect(db.transactionRows).toHaveLength(1);
    expect(db.transactionRows[0]).toMatchObject({
      credits: -4,
      creditBucket: "pack"
    });
  });

  it("allows only one parallel job when the one-job balance is split between subscription and pack", async () => {
    const db = createConcurrentJobDb({
      jobCost: 4,
      creditKind: "blue",
      initialBalance: {
        subscriptionBlueBalance: 2,
        subscriptionGoldBalance: 0,
        packBlueBalance: 2,
        packGoldBalance: 0,
        subscriptionCurrentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
        subscriptionStatus: "active"
      }
    });

    const results = await createTwoParallelJobs();

    expectOneSuccessAndOneInsufficientCreditFailure(results);
    expect(db.balance.packBlueBalance).toBe(0);
    expect(db.balance.subscriptionBlueBalance).toBe(0);
    expect(db.jobRows).toHaveLength(1);
    expect(db.transactionRows).toHaveLength(2);
    expect(db.transactionRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ credits: -2, creditBucket: "subscription" }),
      expect.objectContaining({ credits: -2, creditBucket: "pack" })
    ]));
  });
});
