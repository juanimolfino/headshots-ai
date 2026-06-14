import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/ai/storage", () => ({
  deleteLoraFilesR2ForUser: vi.fn(),
  deleteSupabaseStoragePrefixes: vi.fn()
}));
vi.mock("@/lib/db/queries", () => ({ anonymizeTransactionsForDeletedUser: vi.fn() }));
vi.mock("@/lib/fal/privacy", () => ({ deleteFalRequestPayloads: vi.fn() }));
vi.mock("@/lib/stripe/client", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: vi.fn() }));

import { getDb } from "@/lib/db";
import { deleteAccountData } from "@/lib/account/delete-account";

function mockDb(input: { subscriptions?: unknown[]; jobs?: unknown[] } = {}) {
  vi.mocked(getDb).mockReturnValue({
    query: {
      subscriptions: { findMany: vi.fn().mockResolvedValue(input.subscriptions ?? []) },
      jobs: { findMany: vi.fn().mockResolvedValue(input.jobs ?? []) }
    },
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
  } as never);
}

describe("deleteAccountData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb();
  });

  it("keeps accounting transactions by anonymizing them before deleting the profile", async () => {
    mockDb({
      subscriptions: [{ stripeSubscriptionId: "sub_123", status: "active" }],
      jobs: [{ metadata: { fal_request_id: "req_123" } }]
    });
    const calls: string[] = [];
    const result = await deleteAccountData({
      id: "user_1",
      authUserId: "auth_1",
      email: "person@example.com",
      fullName: "Person",
      stripeCustomerId: "cus_123",
      acceptedTermsAt: null,
      acceptedPrivacyAt: null,
      legalTermsVersion: null,
      legalPrivacyVersion: null,
      photoProcessingConsentAt: null,
      photoProcessingConsentVersion: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }, "auth_1", {
      cancelStripeSubscription: vi.fn(async () => { calls.push("cancel_subscription"); }),
      deleteStripeCustomer: vi.fn(async () => { calls.push("delete_customer"); }),
      deleteR2Loras: vi.fn(async () => { calls.push("delete_r2"); }),
      deleteSupabaseStorage: vi.fn(async () => { calls.push("delete_storage"); }),
      deleteFalPayload: vi.fn(async () => { calls.push("delete_fal"); }),
      anonymizeTransactions: vi.fn(async () => { calls.push("anonymize_transactions"); }),
      deleteProfile: vi.fn(async () => { calls.push("delete_profile"); }),
      deleteAuthUser: vi.fn(async () => { calls.push("delete_auth"); })
    });

    expect(result.ok).toBe(true);
    expect(result.retained.transactions).toContain("anonymized");
    expect(calls).toEqual([
      "cancel_subscription",
      "delete_customer",
      "delete_r2",
      "delete_storage",
      "delete_fal",
      "anonymize_transactions",
      "delete_profile",
      "delete_auth"
    ]);
  });

  it("continues deleting local data when an external service fails", async () => {
    const deleteProfile = vi.fn();
    const result = await deleteAccountData({
      id: "user_1",
      authUserId: "auth_1",
      email: "person@example.com",
      fullName: null,
      stripeCustomerId: null,
      acceptedTermsAt: null,
      acceptedPrivacyAt: null,
      legalTermsVersion: null,
      legalPrivacyVersion: null,
      photoProcessingConsentAt: null,
      photoProcessingConsentVersion: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }, "auth_1", {
      deleteR2Loras: vi.fn(async () => { throw new Error("r2 failed"); }),
      deleteSupabaseStorage: vi.fn(),
      anonymizeTransactions: vi.fn(),
      deleteProfile,
      deleteAuthUser: vi.fn()
    });

    expect(result.ok).toBe(false);
    expect(result.steps.some(step => step.step === "r2.loras.delete" && !step.ok)).toBe(true);
    expect(deleteProfile).toHaveBeenCalledWith("user_1");
  });
});
