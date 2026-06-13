import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { credits, jobs, subscriptions, transactions, users, type CreditBucket, type CreditKind, type JobType } from "@/lib/db/schema";
import { getUsableCreditTotals, planCreditDebit, type CreditBalanceSnapshot, type CreditDebit } from "@/lib/db/credit-balances";
import { sendPurchaseConfirmationEmail, sendWelcomeEmail } from "@/lib/email/send";
import type { User } from "@supabase/supabase-js";

export type CreditGrant = {
  blue?: number;
  gold?: number;
};

export type SubscriptionCreditGrant = Required<CreditGrant> & {
  currentPeriodEnd: Date | null;
  status?: string;
};

function metadataWithDebits(metadata: Record<string, unknown> | null): CreditDebit[] | null {
  const debits = metadata?.creditDebits;
  if (!Array.isArray(debits)) return null;
  const parsed = debits.filter((debit): debit is CreditDebit => {
    if (!debit || typeof debit !== "object") return false;
    const bucket = (debit as { bucket?: unknown }).bucket;
    const creditsValue = (debit as { credits?: unknown }).credits;
    return (bucket === "subscription" || bucket === "pack") && typeof creditsValue === "number" && creditsValue > 0;
  });
  return parsed.length > 0 ? parsed : null;
}

export async function ensureUserProfile(authUser: User) {
  const db = getDb();
  const email = authUser.email ?? "";
  const existing = await db.query.users.findFirst({ where: eq(users.authUserId, authUser.id) });
  if (existing) return existing;

  const signupBlueCredits = Number(process.env.FREE_SIGNUP_BLUE_CREDITS ?? 5);
  const signupGoldCredits = Number(process.env.FREE_SIGNUP_GOLD_CREDITS ?? 0);

  const { profile, createdProfile } = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        authUserId: authUser.id,
        email,
        fullName: authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? null
      })
      .onConflictDoNothing({ target: users.authUserId })
      .returning();

    const profile = created ?? (await tx.query.users.findFirst({ where: eq(users.authUserId, authUser.id) }));
    if (!profile) throw new Error("Could not create user profile");

    if (created) {
      await tx.insert(credits).values({
        userId: profile.id,
        packBlueBalance: signupBlueCredits,
        packGoldBalance: signupGoldCredits,
        subscriptionBlueBalance: 0,
        subscriptionGoldBalance: 0,
        subscriptionStatus: "none"
      }).onConflictDoNothing();
      await tx.insert(subscriptions).values({ userId: profile.id, plan: "free", status: "active" });
      if (signupBlueCredits > 0) {
        await tx.insert(transactions).values({
          userId: profile.id,
          type: "signup_bonus",
          credits: signupBlueCredits,
          creditKind: "blue",
          creditBucket: "pack",
          metadata: { source: "first_login" }
        });
      }
      if (signupGoldCredits > 0) {
        await tx.insert(transactions).values({
          userId: profile.id,
          type: "signup_bonus",
          credits: signupGoldCredits,
          creditKind: "gold",
          creditBucket: "pack",
          metadata: { source: "first_login" }
        });
      }
    }

    return { profile, createdProfile: Boolean(created) };
  });
  if (createdProfile) await sendWelcomeEmail(email, { blue: signupBlueCredits, gold: signupGoldCredits });

  return profile;
}

function emptyCreditSnapshot(): CreditBalanceSnapshot {
  return {
    subscriptionBlueBalance: 0,
    subscriptionGoldBalance: 0,
    packBlueBalance: 0,
    packGoldBalance: 0,
    subscriptionCurrentPeriodEnd: null,
    subscriptionStatus: "none"
  };
}

export async function getDashboard(userId: string) {
  const db = getDb();
  const [creditRow, subscriptionRows, jobRows] = await Promise.all([
    db.query.credits.findFirst({ where: eq(credits.userId, userId) }),
    db.query.subscriptions.findMany({ where: eq(subscriptions.userId, userId), orderBy: desc(subscriptions.createdAt), limit: 1 }),
    db.query.jobs.findMany({ where: eq(jobs.userId, userId), orderBy: desc(jobs.createdAt), limit: 50 })
  ]);

  const creditSnapshot = creditRow ?? emptyCreditSnapshot();
  const usableCredits = getUsableCreditTotals(creditSnapshot);

  return {
    credits: {
      blue: usableCredits.blue,
      gold: usableCredits.gold,
      subscriptionBlue: usableCredits.subscriptionBlue,
      subscriptionGold: usableCredits.subscriptionGold,
      packBlue: usableCredits.packBlue,
      packGold: usableCredits.packGold,
      subscriptionCurrentPeriodEnd: creditSnapshot.subscriptionCurrentPeriodEnd,
      subscriptionStatus: creditSnapshot.subscriptionStatus
    },
    subscription: subscriptionRows[0] ?? null,
    jobs: jobRows
  };
}

export async function createPendingJob(input: {
  userId: string;
  type: JobType;
  payload: Record<string, unknown>;
  creditsUsed: number;
  creditKind: CreditKind;
}) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [creditRow] = await tx
      .select()
      .from(credits)
      .where(eq(credits.userId, input.userId))
      .for("update");

    if (!creditRow) throw new Error("INSUFFICIENT_CREDITS");
    const debits = planCreditDebit(creditRow, input.creditKind, input.creditsUsed);

    const subscriptionDebit = debits.find((debit) => debit.bucket === "subscription")?.credits ?? 0;
    const packDebit = debits.find((debit) => debit.bucket === "pack")?.credits ?? 0;

    await tx
      .update(credits)
      .set(input.creditKind === "gold"
        ? {
            subscriptionGoldBalance: sql`${credits.subscriptionGoldBalance} - ${subscriptionDebit}`,
            packGoldBalance: sql`${credits.packGoldBalance} - ${packDebit}`,
            updatedAt: new Date()
          }
        : {
            subscriptionBlueBalance: sql`${credits.subscriptionBlueBalance} - ${subscriptionDebit}`,
            packBlueBalance: sql`${credits.packBlueBalance} - ${packDebit}`,
            updatedAt: new Date()
          })
      .where(eq(credits.userId, input.userId));

    const [job] = await tx
      .insert(jobs)
      .values({
        userId: input.userId,
        type: input.type,
        input: input.payload,
        metadata: { creditDebits: debits },
        creditsUsed: input.creditsUsed,
        creditKind: input.creditKind
      })
      .returning();

    for (const debit of debits) {
      await tx.insert(transactions).values({
        userId: input.userId,
        type: "credit_spend",
        credits: -debit.credits,
        creditKind: input.creditKind,
        creditBucket: debit.bucket,
        metadata: { jobId: job.id, jobType: input.type }
      });
    }

    return job;
  });
}

export async function refundJobCredits(jobId: string, reason: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for("update");
    if (!job) throw new Error("Job not found");
    if (job.status === "done") return;

    const debits = metadataWithDebits(job.metadata) ?? [{ bucket: "pack" as CreditBucket, credits: job.creditsUsed }];
    const refundKey = `job_refund:${jobId}`;
    let refunded = false;

    for (const debit of debits) {
      const [refund] = await tx.insert(transactions).values({
        userId: job.userId,
        type: "credit_refund",
        credits: debit.credits,
        creditKind: job.creditKind,
        creditBucket: debit.bucket,
        stripeEventId: `${refundKey}:${debit.bucket}`,
        metadata: { jobId, reason }
      }).onConflictDoNothing({ target: transactions.stripeEventId }).returning({ id: transactions.id });

      if (refund) {
        refunded = true;
        await tx
          .update(credits)
          .set(job.creditKind === "gold"
            ? debit.bucket === "subscription"
              ? { subscriptionGoldBalance: sql`${credits.subscriptionGoldBalance} + ${debit.credits}`, updatedAt: new Date() }
              : { packGoldBalance: sql`${credits.packGoldBalance} + ${debit.credits}`, updatedAt: new Date() }
            : debit.bucket === "subscription"
              ? { subscriptionBlueBalance: sql`${credits.subscriptionBlueBalance} + ${debit.credits}`, updatedAt: new Date() }
              : { packBlueBalance: sql`${credits.packBlueBalance} + ${debit.credits}`, updatedAt: new Date() })
          .where(eq(credits.userId, job.userId));
      }
    }

    await tx.update(jobs).set({ status: "failed", error: reason, updatedAt: new Date() }).where(eq(jobs.id, jobId));
    return refunded;
  });
}

export async function markJobProcessing(jobId: string) {
  return getDb()
    .update(jobs)
    .set({ status: "processing", updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "pending")));
}

export async function updateJobMetadata(jobId: string, metadata: Record<string, unknown>) {
  return getDb()
    .update(jobs)
    .set({ metadata, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}

export async function markJobDone(jobId: string, resultUrl: string, result?: unknown) {
  const now = new Date();
  return getDb()
    .update(jobs)
    .set({ status: "done", resultUrl, result: result ?? null, completedAt: now, updatedAt: now })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "processing")));
}

export async function getJobForUser(jobId: string, userId: string) {
  return getDb().query.jobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.userId, userId)) });
}

export async function listJobsForUser(input: { userId: string; type?: JobType; limit?: number }) {
  return getDb().query.jobs.findMany({
    where: input.type ? and(eq(jobs.userId, input.userId), eq(jobs.type, input.type)) : eq(jobs.userId, input.userId),
    orderBy: desc(jobs.createdAt),
    limit: input.limit ?? 50
  });
}

export async function addPackCredits(userId: string, grant: CreditGrant, metadata: Record<string, unknown>, stripeEventId?: string) {
  const db = getDb();
  const blue = Math.max(0, Math.trunc(grant.blue ?? 0));
  const gold = Math.max(0, Math.trunc(grant.gold ?? 0));
  if (blue === 0 && gold === 0) return false;

  const profile = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const applied = await db.transaction(async (tx) => {
    let insertedAny = false;
    const type = metadata.kind === "subscription" ? "subscription_payment" : "credit_purchase";

    if (blue > 0) {
      const [transaction] = await tx.insert(transactions).values({
        userId,
        type,
        credits: blue,
        creditKind: "blue",
        creditBucket: "pack",
        amountCents: typeof metadata.amountCents === "number" ? metadata.amountCents : null,
        stripeEventId: stripeEventId ? `${stripeEventId}:blue` : undefined,
        metadata
      }).onConflictDoNothing().returning({ id: transactions.id });
      insertedAny = insertedAny || Boolean(transaction);
    }

    if (gold > 0) {
      const [transaction] = await tx.insert(transactions).values({
        userId,
        type,
        credits: gold,
        creditKind: "gold",
        creditBucket: "pack",
        amountCents: typeof metadata.amountCents === "number" ? metadata.amountCents : null,
        stripeEventId: stripeEventId ? `${stripeEventId}:gold` : undefined,
        metadata
      }).onConflictDoNothing().returning({ id: transactions.id });
      insertedAny = insertedAny || Boolean(transaction);
    }

    if (!insertedAny) return false;

    await tx
      .insert(credits)
      .values({
        userId,
        packBlueBalance: blue,
        packGoldBalance: gold,
        subscriptionBlueBalance: 0,
        subscriptionGoldBalance: 0,
        subscriptionStatus: "none"
      })
      .onConflictDoUpdate({
        target: credits.userId,
        set: {
          packBlueBalance: sql`${credits.packBlueBalance} + ${blue}`,
          packGoldBalance: sql`${credits.packGoldBalance} + ${gold}`,
          updatedAt: new Date()
        }
      });

    return true;
  });
  if (applied && profile?.email) await sendPurchaseConfirmationEmail(profile.email, { blue, gold });
  return applied;
}

export async function replaceSubscriptionCredits(
  userId: string,
  grant: SubscriptionCreditGrant,
  metadata: Record<string, unknown>,
  stripeEventId?: string
) {
  const db = getDb();
  const blue = Math.max(0, Math.trunc(grant.blue));
  const gold = Math.max(0, Math.trunc(grant.gold));
  const profile = await db.query.users.findFirst({ where: eq(users.id, userId) });

  const applied = await db.transaction(async (tx) => {
    let insertedAny = false;

    if (blue > 0) {
      const [transaction] = await tx.insert(transactions).values({
        userId,
        type: "subscription_payment",
        credits: blue,
        creditKind: "blue",
        creditBucket: "subscription",
        amountCents: typeof metadata.amountCents === "number" ? metadata.amountCents : null,
        stripeEventId: stripeEventId ? `${stripeEventId}:subscription-blue` : undefined,
        metadata
      }).onConflictDoNothing().returning({ id: transactions.id });
      insertedAny = insertedAny || Boolean(transaction);
    }

    if (gold > 0) {
      const [transaction] = await tx.insert(transactions).values({
        userId,
        type: "subscription_payment",
        credits: gold,
        creditKind: "gold",
        creditBucket: "subscription",
        amountCents: typeof metadata.amountCents === "number" ? metadata.amountCents : null,
        stripeEventId: stripeEventId ? `${stripeEventId}:subscription-gold` : undefined,
        metadata
      }).onConflictDoNothing().returning({ id: transactions.id });
      insertedAny = insertedAny || Boolean(transaction);
    }

    if (!insertedAny) return false;

    await tx
      .insert(credits)
      .values({
        userId,
        subscriptionBlueBalance: blue,
        subscriptionGoldBalance: gold,
        packBlueBalance: 0,
        packGoldBalance: 0,
        subscriptionCurrentPeriodEnd: grant.currentPeriodEnd,
        subscriptionStatus: grant.status ?? "active"
      })
      .onConflictDoUpdate({
        target: credits.userId,
        set: {
          subscriptionBlueBalance: blue,
          subscriptionGoldBalance: gold,
          subscriptionCurrentPeriodEnd: grant.currentPeriodEnd,
          subscriptionStatus: grant.status ?? "active",
          updatedAt: new Date()
        }
      });

    return insertedAny;
  });

  if (applied && profile?.email) await sendPurchaseConfirmationEmail(profile.email, { blue, gold });
  return applied;
}

export async function updateCreditSubscriptionState(userId: string, input: {
  status: string;
  currentPeriodEnd?: Date | null;
  clearSubscriptionCredits?: boolean;
}) {
  return getDb()
    .insert(credits)
    .values({
      userId,
      subscriptionBlueBalance: 0,
      subscriptionGoldBalance: 0,
      packBlueBalance: 0,
      packGoldBalance: 0,
      subscriptionStatus: input.status,
      subscriptionCurrentPeriodEnd: input.currentPeriodEnd ?? null
    })
    .onConflictDoUpdate({
      target: credits.userId,
      set: {
        subscriptionStatus: input.status,
        subscriptionCurrentPeriodEnd: input.currentPeriodEnd ?? null,
        ...(input.clearSubscriptionCredits ? {
          subscriptionBlueBalance: 0,
          subscriptionGoldBalance: 0
        } : {}),
        updatedAt: new Date()
      }
    });
}
