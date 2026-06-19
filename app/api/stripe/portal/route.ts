import { NextResponse } from "next/server";
import { ensureUserProfile } from "@/lib/db/queries";
import { getAppUrl } from "@/lib/app-url";
import { ensureStripeCustomerForUser } from "@/lib/stripe/customer";
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
  const customerId = await ensureStripeCustomerForUser(profile);

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/dashboard`
  });

  return NextResponse.redirect(portal.url, 303);
}
