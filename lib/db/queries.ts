import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { credits, jobs, subscriptions, transactions, users, type CreditKind, type JobType } from "@/lib/db/schema";
import { sendPurchaseConfirmationEmail, sendWelcomeEmail } from "@/lib/email/send";
import type { User } from "@supabase/supabase-js";

export type CreditGrant = {
  blue?: number;
  gold?: number;
};

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
        blueBalance: signupBlueCredits,
        goldBalance: signupGoldCredits
      }).onConflictDoNothing();
      await tx.insert(subscriptions).values({ userId: profile.id, plan: "free", status: "active" });
      if (signupBlueCredits > 0) {
        await tx.insert(transactions).values({
          userId: profile.id,
          type: "signup_bonus",
          credits: signupBlueCredits,
          creditKind: "blue",
          metadata: { source: "first_login" }
        });
      }
      if (signupGoldCredits > 0) {
        await tx.insert(transactions).values({
          userId: profile.id,
          type: "signup_bonus",
          credits: signupGoldCredits,
          creditKind: "gold",
          metadata: { source: "first_login" }
        });
      }
    }

    return { profile, createdProfile: Boolean(created) };
  });
  if (createdProfile) await sendWelcomeEmail(email, { blue: signupBlueCredits, gold: signupGoldCredits });

  return profile;
}

export async function getDashboard(userId: string) {
  const db = getDb();
  const [creditRow, subscriptionRows, jobRows] = await Promise.all([
    db.query.credits.findFirst({ where: eq(credits.userId, userId) }),
    db.query.subscriptions.findMany({ where: eq(subscriptions.userId, userId), orderBy: desc(subscriptions.createdAt), limit: 1 }),
    db.query.jobs.findMany({ where: eq(jobs.userId, userId), orderBy: desc(jobs.createdAt), limit: 50 })
  ]);

  return {
    credits: {
      blue: creditRow?.blueBalance ?? 0,
      gold: creditRow?.goldBalance ?? 0
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
  const balanceColumn = input.creditKind === "gold" ? credits.goldBalance : credits.blueBalance;
  return db.transaction(async (tx) => {
    const [creditRow] = await tx
      .select()
      .from(credits)
      .where(and(eq(credits.userId, input.userId), sql`${balanceColumn} >= ${input.creditsUsed}`))
      .for("update");

    if (!creditRow) throw new Error("INSUFFICIENT_CREDITS");

    await tx
      .update(credits)
      .set(input.creditKind === "gold"
        ? { goldBalance: sql`${credits.goldBalance} - ${input.creditsUsed}`, updatedAt: new Date() }
        : { blueBalance: sql`${credits.blueBalance} - ${input.creditsUsed}`, updatedAt: new Date() })
      .where(eq(credits.userId, input.userId));

    const [job] = await tx
      .insert(jobs)
      .values({
        userId: input.userId,
        type: input.type,
        input: input.payload,
        creditsUsed: input.creditsUsed,
        creditKind: input.creditKind
      })
      .returning();

    await tx.insert(transactions).values({
      userId: input.userId,
      type: "credit_spend",
      credits: -input.creditsUsed,
      creditKind: input.creditKind,
      metadata: { jobId: job.id, jobType: input.type }
    });

    return job;
  });
}

export async function refundJobCredits(jobId: string, reason: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for("update");
    if (!job) throw new Error("Job not found");
    if (job.status === "done") return;

    const refundKey = `job_refund:${jobId}`;
    const [refund] = await tx.insert(transactions).values({
      userId: job.userId,
      type: "credit_refund",
      credits: job.creditsUsed,
      creditKind: job.creditKind,
      stripeEventId: refundKey,
      metadata: { jobId, reason }
    }).onConflictDoNothing({ target: transactions.stripeEventId }).returning({ id: transactions.id });

    if (refund) {
      await tx
        .update(credits)
        .set(job.creditKind === "gold"
          ? { goldBalance: sql`${credits.goldBalance} + ${job.creditsUsed}`, updatedAt: new Date() }
          : { blueBalance: sql`${credits.blueBalance} + ${job.creditsUsed}`, updatedAt: new Date() })
        .where(eq(credits.userId, job.userId));
    }

    await tx.update(jobs).set({ status: "failed", error: reason, updatedAt: new Date() }).where(eq(jobs.id, jobId));
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

export async function addCredits(userId: string, grant: CreditGrant, metadata: Record<string, unknown>, stripeEventId?: string) {
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
        amountCents: typeof metadata.amountCents === "number" ? metadata.amountCents : null,
        stripeEventId: stripeEventId ? `${stripeEventId}:gold` : undefined,
        metadata
      }).onConflictDoNothing().returning({ id: transactions.id });
      insertedAny = insertedAny || Boolean(transaction);
    }

    if (!insertedAny) return false;

    await tx
      .insert(credits)
      .values({ userId, blueBalance: blue, goldBalance: gold })
      .onConflictDoUpdate({
        target: credits.userId,
        set: {
          blueBalance: sql`${credits.blueBalance} + ${blue}`,
          goldBalance: sql`${credits.goldBalance} + ${gold}`,
          updatedAt: new Date()
        }
      });

    return true;
  });
  if (applied && profile?.email) await sendPurchaseConfirmationEmail(profile.email, { blue, gold });
  return applied;
}
