import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { subscriptions, users } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe/client";

type StripeCustomerProfile = {
  id: string;
  email: string;
  stripeCustomerId: string | null;
};

type EnsureStripeCustomerOptions = {
  allowCreate?: boolean;
};

export async function findUserByStripeCustomerId(customerId: string) {
  return getDb().query.users.findFirst({
    columns: {
      id: true,
      email: true,
      fullName: true,
      stripeCustomerId: true
    },
    where: eq(users.stripeCustomerId, customerId)
  });
}

async function storeStripeCustomerId(userId: string, customerId: string) {
  await getDb()
    .update(users)
    .set({ stripeCustomerId: customerId })
    .where(eq(users.id, userId));
}

async function findStripeCustomerIdFromLatestSubscription(userId: string) {
  const subscription = await getDb().query.subscriptions.findFirst({
    columns: {
      stripeSubscriptionId: true
    },
    where: and(eq(subscriptions.userId, userId), isNotNull(subscriptions.stripeSubscriptionId)),
    orderBy: desc(subscriptions.createdAt)
  });

  if (!subscription?.stripeSubscriptionId) return null;
  const stripeSubscription = await getStripe().subscriptions.retrieve(subscription.stripeSubscriptionId);
  const customerId = typeof stripeSubscription.customer === "string"
    ? stripeSubscription.customer
    : stripeSubscription.customer?.id ?? null;
  if (!customerId) return null;

  await storeStripeCustomerId(userId, customerId);
  return customerId;
}

export async function ensureStripeCustomerForUser(profile: StripeCustomerProfile, options: EnsureStripeCustomerOptions = {}) {
  if (profile.stripeCustomerId) return profile.stripeCustomerId;

  const customerIdFromSubscription = await findStripeCustomerIdFromLatestSubscription(profile.id);
  if (customerIdFromSubscription) return customerIdFromSubscription;

  if (options.allowCreate === false) {
    throw new Error("STRIPE_CUSTOMER_NOT_FOUND");
  }

  const customer = await getStripe().customers.create({
    email: profile.email,
    metadata: { userId: profile.id }
  });

  await storeStripeCustomerId(profile.id, customer.id);

  return customer.id;
}
