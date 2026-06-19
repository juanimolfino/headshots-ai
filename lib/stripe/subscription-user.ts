import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { findUserByStripeCustomerId } from "@/lib/stripe/customer";

export async function resolveStripeSubscriptionUserId(input: {
  metadataUserId?: string | null;
  subscriptionId: string;
  customerId?: string | null;
  loadSubscriptionUserId?: (subscriptionId: string) => Promise<string | null>;
  loadCustomerUserId?: (customerId: string) => Promise<string | null>;
}) {
  if (input.metadataUserId) return input.metadataUserId;

  const subscriptionUserId = input.loadSubscriptionUserId
    ? await input.loadSubscriptionUserId(input.subscriptionId)
    : (await getDb().query.subscriptions.findFirst({
        where: eq(subscriptions.stripeSubscriptionId, input.subscriptionId)
      }))?.userId ?? null;
  if (subscriptionUserId) return subscriptionUserId;

  if (!input.customerId) return null;
  if (input.loadCustomerUserId) return input.loadCustomerUserId(input.customerId);
  const customerUser = await findUserByStripeCustomerId(input.customerId);
  return customerUser?.id ?? null;
}
