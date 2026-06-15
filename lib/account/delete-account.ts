import { eq } from "drizzle-orm";
import { deleteLoraFilesR2ForUser, deleteSupabaseStoragePrefixes } from "@/lib/ai/storage";
import { getDb } from "@/lib/db";
import { anonymizeTransactionsForDeletedUser } from "@/lib/db/queries";
import { jobs, subscriptions, users, type Job } from "@/lib/db/schema";
import { deleteFalRequestPayloads } from "@/lib/fal/privacy";
import { logWarn } from "@/lib/observability/logger";
import { getStripe } from "@/lib/stripe/client";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type DeleteAccountStep = {
  step: string;
  ok: boolean;
  message?: string;
};

export type DeleteAccountDeps = {
  cancelStripeSubscription?: (subscriptionId: string) => Promise<unknown>;
  deleteStripeCustomer?: (customerId: string) => Promise<unknown>;
  deleteR2Loras?: (userId: string) => Promise<unknown>;
  deleteSupabaseStorage?: (userId: string) => Promise<unknown>;
  deleteFalPayload?: (requestId: string) => Promise<unknown>;
  anonymizeTransactions?: (userId: string) => Promise<unknown>;
  deleteProfile?: (userId: string) => Promise<unknown>;
  deleteAuthUser?: (authUserId: string) => Promise<unknown>;
};

type UserProfile = typeof users.$inferSelect;

function statusFromResult(step: string, result: unknown): DeleteAccountStep {
  return { step, ok: true, message: typeof result === "string" ? result : undefined };
}

async function runStep(steps: DeleteAccountStep[], step: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    steps.push(statusFromResult(step, result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWarn("account_delete_step_failed", {
      area: "account.delete",
      step,
      message
    });
    steps.push({ step, ok: false, message });
  }
}

function getFalRequestIds(jobRows: Job[]) {
  return Array.from(new Set(jobRows
    .map(job => {
      const metadata = job.metadata as Record<string, unknown> | null;
      return typeof metadata?.fal_request_id === "string" ? metadata.fal_request_id : null;
    })
    .filter((requestId): requestId is string => Boolean(requestId))));
}

export async function deleteAccountData(profile: UserProfile, authUserId: string, deps: DeleteAccountDeps = {}) {
  const db = getDb();
  const steps: DeleteAccountStep[] = [];
  const [subscriptionRows, jobRows] = await Promise.all([
    db.query.subscriptions.findMany({ where: eq(subscriptions.userId, profile.id) }),
    db.query.jobs.findMany({ where: eq(jobs.userId, profile.id) })
  ]);

  const activeSubscriptionIds = subscriptionRows
    .filter(row => row.stripeSubscriptionId && ["active", "trialing", "past_due", "incomplete"].includes(row.status))
    .map(row => row.stripeSubscriptionId!);

  for (const subscriptionId of activeSubscriptionIds) {
    await runStep(steps, `stripe.subscription.cancel:${subscriptionId}`, () =>
      deps.cancelStripeSubscription
        ? deps.cancelStripeSubscription(subscriptionId)
        : getStripe().subscriptions.cancel(subscriptionId)
    );
  }

  if (profile.stripeCustomerId) {
    await runStep(steps, "stripe.customer.delete", () =>
      deps.deleteStripeCustomer
        ? deps.deleteStripeCustomer(profile.stripeCustomerId!)
        : getStripe().customers.del(profile.stripeCustomerId!)
    );
  }

  await runStep(steps, "r2.loras.delete", () =>
    deps.deleteR2Loras ? deps.deleteR2Loras(profile.id) : deleteLoraFilesR2ForUser(profile.id)
  );

  await runStep(steps, "supabase.storage.delete", () =>
    deps.deleteSupabaseStorage
      ? deps.deleteSupabaseStorage(profile.id)
      : deleteSupabaseStoragePrefixes(process.env.SUPABASE_STORAGE_BUCKET ?? "ai-results", [
          `headshots/${profile.id}`,
          `loras/${profile.id}`,
          profile.id
        ])
  );

  for (const requestId of getFalRequestIds(jobRows)) {
    await runStep(steps, `fal.payload.delete:${requestId}`, () =>
      deps.deleteFalPayload ? deps.deleteFalPayload(requestId) : deleteFalRequestPayloads(requestId, { reason: "account_delete" })
    );
  }

  await runStep(steps, "transactions.anonymize", () =>
    deps.anonymizeTransactions ? deps.anonymizeTransactions(profile.id) : anonymizeTransactionsForDeletedUser(profile.id)
  );

  await runStep(steps, "db.profile.delete", () =>
    deps.deleteProfile ? deps.deleteProfile(profile.id) : db.delete(users).where(eq(users.id, profile.id))
  );

  await runStep(steps, "supabase.auth.delete", () =>
    deps.deleteAuthUser ? deps.deleteAuthUser(authUserId) : getSupabaseAdmin().auth.admin.deleteUser(authUserId)
  );

  return {
    ok: steps.every(step => step.ok),
    steps,
    retained: {
      transactions: "anonymized and retained for accounting/tax records"
    }
  };
}
