import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ensureUserProfile } from "@/lib/db/queries";
import { getAppUrl } from "@/lib/app-url";
import { users } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkBillingPortalRateLimit } from "@/lib/redis/rate-limit";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const profile = await ensureUserProfile(user);
  try {
    await checkBillingPortalRateLimit(profile.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "BILLING_PORTAL_RATE_LIMITED";
    if (message === "BILLING_PORTAL_RATE_LIMITED") {
      return NextResponse.json({ error: "Too many billing portal sessions. Please wait a few minutes." }, { status: 429 });
    }
    throw error;
  }

  const stripe = getStripe();
  const appUrl = getAppUrl(new URL(request.url).origin);
  let customerId = profile.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({ email: profile.email, metadata: { userId: profile.id } });
    customerId = customer.id;
    await getDb().update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, profile.id));
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/dashboard`
  });

  return NextResponse.redirect(portal.url, 303);
}
