import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe/client";

type StripeCustomerProfile = {
  id: string;
  email: string;
  stripeCustomerId: string | null;
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

export async function ensureStripeCustomerForUser(profile: StripeCustomerProfile) {
  if (profile.stripeCustomerId) return profile.stripeCustomerId;

  const customer = await getStripe().customers.create({
    email: profile.email,
    metadata: { userId: profile.id }
  });

  await getDb()
    .update(users)
    .set({ stripeCustomerId: customer.id })
    .where(eq(users.id, profile.id));

  return customer.id;
}
