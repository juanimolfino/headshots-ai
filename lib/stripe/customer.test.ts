import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getStripe: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  getDb: mocks.getDb
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripe: mocks.getStripe
}));

import { ensureStripeCustomerForUser } from "@/lib/stripe/customer";
import { resolveStripeSubscriptionUserId } from "@/lib/stripe/subscription-user";

describe("Stripe customer reuse", () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getStripe.mockReset();
  });

  it("reuses an existing stripe customer id without creating another customer", async () => {
    const customerId = await ensureStripeCustomerForUser({
      id: "user_1",
      email: "user@example.com",
      stripeCustomerId: "cus_existing"
    });

    expect(customerId).toBe("cus_existing");
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });

  it("creates and stores a stripe customer when one does not exist", async () => {
    const updateWhere = vi.fn(async () => undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const updateUsers = vi.fn(() => ({ set: updateSet }));
    const create = vi.fn(async () => ({ id: "cus_new" }));
    const findSubscription = vi.fn(async () => null);

    mocks.getDb.mockReturnValue({
      query: { subscriptions: { findFirst: findSubscription } },
      update: updateUsers
    });
    mocks.getStripe.mockReturnValue({ customers: { create } });

    const customerId = await ensureStripeCustomerForUser({
      id: "user_1",
      email: "user@example.com",
      stripeCustomerId: null
    });

    expect(customerId).toBe("cus_new");
    expect(create).toHaveBeenCalledWith({
      email: "user@example.com",
      metadata: { userId: "user_1" }
    });
    expect(updateUsers).toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith({ stripeCustomerId: "cus_new" });
    expect(updateWhere).toHaveBeenCalled();
  });

  it("recovers and stores the customer id from an existing subscription before creating a new customer", async () => {
    const updateWhere = vi.fn(async () => undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const updateUsers = vi.fn(() => ({ set: updateSet }));
    const retrieve = vi.fn(async () => ({ customer: "cus_from_subscription" }));
    const create = vi.fn();

    mocks.getDb.mockReturnValue({
      query: { subscriptions: { findFirst: vi.fn(async () => ({ stripeSubscriptionId: "sub_123" })) } },
      update: updateUsers
    });
    mocks.getStripe.mockReturnValue({
      subscriptions: { retrieve },
      customers: { create }
    });

    const customerId = await ensureStripeCustomerForUser({
      id: "user_1",
      email: "user@example.com",
      stripeCustomerId: null
    });

    expect(customerId).toBe("cus_from_subscription");
    expect(retrieve).toHaveBeenCalledWith("sub_123");
    expect(create).not.toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith({ stripeCustomerId: "cus_from_subscription" });
  });
});

describe("Stripe subscription user resolution", () => {
  it("falls back from missing metadata to subscription row, then customer id", async () => {
    await expect(resolveStripeSubscriptionUserId({
      metadataUserId: null,
      subscriptionId: "sub_123",
      customerId: "cus_123",
      loadSubscriptionUserId: async () => "user_from_subscription",
      loadCustomerUserId: async () => "user_from_customer"
    })).resolves.toBe("user_from_subscription");

    await expect(resolveStripeSubscriptionUserId({
      metadataUserId: null,
      subscriptionId: "sub_123",
      customerId: "cus_123",
      loadSubscriptionUserId: async () => null,
      loadCustomerUserId: async () => "user_from_customer"
    })).resolves.toBe("user_from_customer");
  });

  it("returns metadata user id immediately when present", async () => {
    await expect(resolveStripeSubscriptionUserId({
      metadataUserId: "user_meta",
      subscriptionId: "sub_123",
      customerId: "cus_123"
    })).resolves.toBe("user_meta");
  });
});
