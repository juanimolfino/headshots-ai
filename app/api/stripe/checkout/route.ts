import { NextResponse } from "next/server";
import { ensureUserProfile } from "@/lib/db/queries";
import { getAppUrl } from "@/lib/app-url";
import { getCreditPack, getSubscriptionPlan } from "@/lib/stripe/pricing";
import { getStripe } from "@/lib/stripe/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION } from "@/lib/legal/consent";

const checkoutLegalMetadata = {
  legalTermsVersion: LEGAL_TERMS_VERSION,
  legalPrivacyVersion: LEGAL_PRIVACY_VERSION
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const profile = await ensureUserProfile(user);
  const form = await request.formData();
  const mode = String(form.get("mode") ?? "pack");
  const appUrl = getAppUrl(new URL(request.url).origin);

  if (mode === "subscription") {
    const plan = getSubscriptionPlan(String(form.get("planId") ?? "pro"));
    if (!plan) return NextResponse.json({ error: "Invalid subscription plan" }, { status: 400 });
    const price = process.env[plan.stripePriceEnv];
    if (!price) throw new Error(`${plan.stripePriceEnv} is required`);
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer_email: profile.email,
      line_items: [{ price, quantity: 1 }],
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/pricing`,
      metadata: { userId: profile.id, kind: "subscription", plan: plan.id, ...checkoutLegalMetadata },
      subscription_data: { metadata: { userId: profile.id, plan: plan.id } },
      custom_text: {
        submit: { message: "By confirming payment, you agree to the Terms, Privacy Policy, and Refund Policy linked before checkout." }
      }
    });
    return NextResponse.redirect(session.url!, 303);
  }

  if (mode !== "pack") return NextResponse.json({ error: "Invalid checkout mode" }, { status: 400 });

  const pack = getCreditPack(String(form.get("packId") ?? "blue_starter"));
  if (!pack) return NextResponse.json({ error: "Invalid credit pack" }, { status: 400 });
  const price = process.env[pack.stripePriceEnv];
  if (!price) throw new Error(`${pack.stripePriceEnv} is required`);

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer_email: profile.email,
    line_items: [{ price, quantity: 1 }],
    success_url: `${appUrl}/dashboard?checkout=success`,
    cancel_url: `${appUrl}/pricing`,
    metadata: { userId: profile.id, kind: "pack", packId: pack.id, ...checkoutLegalMetadata },
    custom_text: {
      submit: { message: "By confirming payment, you agree to the Terms, Privacy Policy, and Refund Policy linked before checkout." }
    }
  });

  return NextResponse.redirect(session.url!, 303);
}
