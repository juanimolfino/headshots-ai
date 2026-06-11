import { NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { addPackCredits, replaceSubscriptionCredits, updateCreditSubscriptionState } from "@/lib/db/queries";
import { subscriptions, users } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe/client";
import { getPlanByStripePriceId, parseStripeCreditGrant } from "@/lib/stripe/pricing";

async function getCheckoutSessionPrice(sessionId: string) {
  const lineItems = await getStripe().checkout.sessions.listLineItems(sessionId, {
    limit: 1,
    expand: ["data.price"]
  });
  return lineItems.data[0]?.price ?? null;
}

async function getSubscriptionWithPrice(subscriptionId: string) {
  return getStripe().subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"]
  }) as Promise<Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  }>;
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription & { current_period_end?: number }) {
  return subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
}

function subscriptionPeriodStart(subscription: Stripe.Subscription & { current_period_start?: number }) {
  return subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null;
}

function normalizeSubscriptionStatus(subscription: Stripe.Subscription) {
  if (subscription.status === "past_due") return "past_due";
  if (subscription.status === "canceled" || subscription.status === "unpaid" || subscription.status === "incomplete_expired") {
    return "canceled";
  }
  if (subscription.status === "active" || subscription.status === "trialing") return "active";
  return "none";
}

function getInvoicePrice(invoice: Stripe.Invoice) {
  const line = invoice.lines?.data.find((item) => {
    const price = (item as Stripe.InvoiceLineItem & { price?: Stripe.Price | null }).price;
    return Boolean(price);
  });
  return (line as Stripe.InvoiceLineItem & { price?: Stripe.Price | null } | undefined)?.price ?? null;
}

async function getSubscriptionUserId(subscription: Stripe.Subscription) {
  if (subscription.metadata.userId) return subscription.metadata.userId;
  const row = await getDb().query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, subscription.id)
  });
  return row?.userId ?? null;
}

async function upsertSubscriptionRow(input: {
  userId: string;
  subscription: Stripe.Subscription & { current_period_start?: number; current_period_end?: number };
  plan: string;
}) {
  await getDb().insert(subscriptions).values({
    userId: input.userId,
    plan: input.plan,
    status: input.subscription.status,
    stripeSubscriptionId: input.subscription.id,
    currentPeriodStart: subscriptionPeriodStart(input.subscription),
    currentPeriodEnd: subscriptionPeriodEnd(input.subscription),
    cancelAtPeriodEnd: input.subscription.cancel_at_period_end
  }).onConflictDoUpdate({
    target: subscriptions.stripeSubscriptionId,
    set: {
      plan: input.plan,
      status: input.subscription.status,
      currentPeriodStart: subscriptionPeriodStart(input.subscription),
      currentPeriodEnd: subscriptionPeriodEnd(input.subscription),
      cancelAtPeriodEnd: input.subscription.cancel_at_period_end,
      updatedAt: new Date()
    }
  });
}

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    if (userId && session.customer) {
      await getDb().update(users).set({ stripeCustomerId: String(session.customer) }).where(eq(users.id, userId));
    }
    if (userId && session.mode === "payment") {
      const price = await getCheckoutSessionPrice(session.id);
      const grant = parseStripeCreditGrant(price?.metadata ?? {});
      if (grant?.kind === "pack") {
        await addPackCredits(userId, { blue: grant.blue, gold: grant.gold }, {
          kind: "pack",
          checkoutSessionId: session.id,
          priceId: price?.id,
          amountCents: session.amount_total ?? 0
        }, event.id);
      }
    }
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    };
    const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
    if (subscriptionId) {
      const subscription = await getSubscriptionWithPrice(subscriptionId);
      const userId = subscription.metadata.userId;
      if (userId) {
        const price = getInvoicePrice(invoice) ?? subscription.items.data[0]?.price ?? null;
        const grant = parseStripeCreditGrant(price?.metadata ?? {});
        if (!grant || grant.kind !== "subscription") {
          return NextResponse.json({ received: true });
        }
        const plan = getPlanByStripePriceId(price?.id);
        const periodEnd = subscriptionPeriodEnd(subscription);
        await replaceSubscriptionCredits(userId, {
          blue: grant.blue,
          gold: grant.gold,
          currentPeriodEnd: periodEnd,
          status: "active"
        }, {
          kind: "subscription",
          subscriptionId,
          priceId: price?.id,
          amountCents: invoice.amount_paid
        }, event.id);
        await upsertSubscriptionRow({
          userId,
          subscription,
          plan: subscription.metadata.plan ?? plan?.id ?? "unknown"
        });
      }
    }
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription & {
      current_period_start?: number;
      current_period_end?: number;
    };
    const userId = await getSubscriptionUserId(subscription);
    if (userId) {
      const price = subscription.items.data[0]?.price ?? null;
      const plan = getPlanByStripePriceId(price?.id);
      const status = normalizeSubscriptionStatus(subscription);
      await updateCreditSubscriptionState(userId, {
        status,
        currentPeriodEnd: subscriptionPeriodEnd(subscription)
      });
      await upsertSubscriptionRow({
        userId,
        subscription,
        plan: subscription.metadata.plan ?? plan?.id ?? "unknown"
      });
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription & {
      current_period_start?: number;
      current_period_end?: number;
    };
    const userId = await getSubscriptionUserId(subscription);
    if (userId) {
      await updateCreditSubscriptionState(userId, {
        status: "canceled",
        currentPeriodEnd: subscriptionPeriodEnd(subscription),
        clearSubscriptionCredits: true
      });
    }
    await getDb()
      .update(subscriptions)
      .set({ status: "canceled", cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    };
    const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
    if (subscriptionId) {
      const subscription = await getSubscriptionWithPrice(subscriptionId);
      const userId = await getSubscriptionUserId(subscription);
      if (userId) {
        await updateCreditSubscriptionState(userId, {
          status: "past_due",
          currentPeriodEnd: subscriptionPeriodEnd(subscription)
        });
        await upsertSubscriptionRow({
          userId,
          subscription,
          plan: subscription.metadata.plan ?? "unknown"
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
