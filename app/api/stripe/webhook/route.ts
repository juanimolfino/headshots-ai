import { NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { addPackCredits, applySubscriptionLifecycleEvent, replaceSubscriptionCredits } from "@/lib/db/queries";
import { subscriptions, users } from "@/lib/db/schema";
import { sendTelegramPaymentNotification } from "@/lib/notifications/telegram";
import { reportError } from "@/lib/observability/report-error";
import { getStripe } from "@/lib/stripe/client";
import { getCreditPackByStripePriceId, getPlanByStripePriceId, parseStripeCreditGrant } from "@/lib/stripe/pricing";

async function getCheckoutSessionPrice(sessionId: string) {
  const lineItems = await getStripe().checkout.sessions.listLineItems(sessionId, {
    limit: 1,
    expand: ["data.price"]
  });
  return lineItems.data[0]?.price ?? null;
}

type SubscriptionWithPeriods = Stripe.Subscription & {
  current_period_start?: number;
  current_period_end?: number;
  items: Stripe.ApiList<Stripe.SubscriptionItem & {
    current_period_start?: number;
    current_period_end?: number;
    price?: Stripe.Price;
  }>;
};

type InvoiceWithSubscriptionDetails = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
  parent?: {
    subscription_details?: {
      subscription?: string | Stripe.Subscription | null;
      metadata?: Stripe.Metadata | null;
    } | null;
  } | null;
  lines?: Stripe.ApiList<Stripe.InvoiceLineItem & {
    price?: Stripe.Price | null;
    pricing?: {
      price_details?: {
        price?: string | Stripe.Price | null;
      } | null;
    } | null;
    parent?: {
      subscription_item_details?: {
        subscription?: string | null;
      } | null;
    } | null;
  }>;
};

type InvoiceLineItemWithPrice = NonNullable<InvoiceWithSubscriptionDetails["lines"]>["data"][number];

async function getSubscriptionWithPrice(subscriptionId: string) {
  return getStripe().subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"]
  }) as Promise<SubscriptionWithPeriods>;
}

function unixTimestampDate(timestamp: number | null | undefined) {
  return timestamp ? new Date(timestamp * 1000) : null;
}

function stripeEventCreatedDate(event: Stripe.Event) {
  return new Date(event.created * 1000);
}

function subscriptionPeriodEnd(subscription: SubscriptionWithPeriods, invoice?: InvoiceWithSubscriptionDetails) {
  return unixTimestampDate(
    subscription.current_period_end ??
    subscription.items.data[0]?.current_period_end ??
    invoice?.lines?.data[0]?.period?.end
  );
}

function subscriptionPeriodStart(subscription: SubscriptionWithPeriods, invoice?: InvoiceWithSubscriptionDetails) {
  return unixTimestampDate(
    subscription.current_period_start ??
    subscription.items.data[0]?.current_period_start ??
    invoice?.lines?.data[0]?.period?.start
  );
}

function normalizeSubscriptionStatus(subscription: Stripe.Subscription) {
  if (subscription.status === "past_due") return "past_due";
  if (subscription.status === "canceled" || subscription.status === "unpaid" || subscription.status === "incomplete_expired") {
    return "canceled";
  }
  if (subscription.status === "active" || subscription.status === "trialing") return "active";
  return "none";
}

function getSubscriptionIdFromValue(value: string | Stripe.Subscription | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function getInvoiceSubscriptionId(invoice: InvoiceWithSubscriptionDetails) {
  const lines = invoice.lines?.data as InvoiceLineItemWithPrice[] | undefined;
  return (
    getSubscriptionIdFromValue(invoice.subscription) ??
    getSubscriptionIdFromValue(invoice.parent?.subscription_details?.subscription) ??
    lines?.find((item) => item.parent?.subscription_item_details?.subscription)
      ?.parent?.subscription_item_details?.subscription ??
    null
  );
}

function getPriceIdFromValue(value: string | Stripe.Price | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function getInvoicePrice(invoice: InvoiceWithSubscriptionDetails) {
  const lines = invoice.lines?.data as InvoiceLineItemWithPrice[] | undefined;
  const line = lines?.find((item) => {
    const price = item.price ?? item.pricing?.price_details?.price;
    return Boolean(price);
  });
  const price = line?.price ?? line?.pricing?.price_details?.price ?? null;
  return typeof price === "string" ? null : price;
}

function getInvoicePriceId(invoice: InvoiceWithSubscriptionDetails) {
  const lines = invoice.lines?.data as InvoiceLineItemWithPrice[] | undefined;
  const line = lines?.find((item) => {
    const price = item.price ?? item.pricing?.price_details?.price;
    return Boolean(price);
  });
  return getPriceIdFromValue(line?.price ?? line?.pricing?.price_details?.price ?? null);
}

async function resolveInvoicePrice(invoice: InvoiceWithSubscriptionDetails, subscription: SubscriptionWithPeriods) {
  const invoicePrice = getInvoicePrice(invoice);
  if (invoicePrice?.metadata?.kind) return invoicePrice;

  const invoicePriceId = getInvoicePriceId(invoice);
  const subscriptionPrice = subscription.items.data.find((item) => item.price?.id === invoicePriceId)?.price ??
    subscription.items.data[0]?.price ??
    null;
  if (subscriptionPrice?.metadata?.kind) return subscriptionPrice;

  if (invoicePriceId) return getStripe().prices.retrieve(invoicePriceId);
  return null;
}

async function getSubscriptionUserId(subscription: Stripe.Subscription) {
  if (subscription.metadata.userId) return subscription.metadata.userId;
  const row = await getDb().query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, subscription.id)
  });
  return row?.userId ?? null;
}

async function getUserPaymentLabel(userId: string) {
  return getDb().query.users.findFirst({
    columns: {
      email: true,
      fullName: true
    },
    where: eq(users.id, userId)
  });
}

async function upsertSubscriptionRow(input: {
  userId: string;
  subscription: SubscriptionWithPeriods;
  plan: string;
  invoice?: InvoiceWithSubscriptionDetails;
}) {
  await getDb().insert(subscriptions).values({
    userId: input.userId,
    plan: input.plan,
    status: input.subscription.status,
    stripeSubscriptionId: input.subscription.id,
    currentPeriodStart: subscriptionPeriodStart(input.subscription, input.invoice),
    currentPeriodEnd: subscriptionPeriodEnd(input.subscription, input.invoice),
    cancelAtPeriodEnd: input.subscription.cancel_at_period_end
  }).onConflictDoUpdate({
    target: subscriptions.stripeSubscriptionId,
    set: {
      plan: input.plan,
      status: input.subscription.status,
      currentPeriodStart: subscriptionPeriodStart(input.subscription, input.invoice),
      currentPeriodEnd: subscriptionPeriodEnd(input.subscription, input.invoice),
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

  try {
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
          const applied = await addPackCredits(userId, { blue: grant.blue, gold: grant.gold }, {
            kind: "pack",
            checkoutSessionId: session.id,
            priceId: price?.id,
            amountCents: session.amount_total ?? 0
          }, event.id);
          if (applied) {
            const customer = await getUserPaymentLabel(userId);
            const pack = getCreditPackByStripePriceId(price?.id);
            await sendTelegramPaymentNotification({
              customerName: customer?.fullName,
              customerEmail: customer?.email,
              itemName: pack?.name ?? price?.nickname ?? price?.id ?? "Credit pack",
              paymentType: "Pack",
              amountCents: session.amount_total ?? 0,
              currency: session.currency ?? price?.currency,
              credits: { blue: grant.blue, gold: grant.gold }
            });
          }
        }
      }
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object as InvoiceWithSubscriptionDetails;
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (subscriptionId) {
        const subscription = await getSubscriptionWithPrice(subscriptionId);
        const userId = subscription.metadata.userId;
        if (userId) {
          const price = await resolveInvoicePrice(invoice, subscription);
          const grant = parseStripeCreditGrant(price?.metadata ?? {});
          if (!grant || grant.kind !== "subscription") {
            return NextResponse.json({ received: true });
          }
          const plan = getPlanByStripePriceId(price?.id);
          const periodEnd = subscriptionPeriodEnd(subscription, invoice);
          const applied = await replaceSubscriptionCredits(userId, {
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
          if (applied) {
            const customer = await getUserPaymentLabel(userId);
            await sendTelegramPaymentNotification({
              customerName: customer?.fullName,
              customerEmail: customer?.email,
              itemName: plan?.name ?? subscription.metadata.plan ?? price?.nickname ?? price?.id ?? "Subscription",
              paymentType: "Subscription",
              amountCents: invoice.amount_paid,
              currency: invoice.currency ?? price?.currency,
              credits: { blue: grant.blue, gold: grant.gold }
            });
          }
          await upsertSubscriptionRow({
            userId,
            subscription,
            plan: subscription.metadata.plan ?? plan?.id ?? "unknown",
            invoice
          });
        }
      }
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as SubscriptionWithPeriods;
      const userId = await getSubscriptionUserId(subscription);
      if (userId) {
        const price = subscription.items.data[0]?.price ?? null;
        const plan = getPlanByStripePriceId(price?.id);
        const status = normalizeSubscriptionStatus(subscription);
        await applySubscriptionLifecycleEvent({
          userId,
          subscriptionId: subscription.id,
          plan: subscription.metadata.plan ?? plan?.id ?? "unknown",
          subscriptionStatus: subscription.status,
          creditStatus: status,
          currentPeriodStart: subscriptionPeriodStart(subscription),
          currentPeriodEnd: subscriptionPeriodEnd(subscription),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          stripeEventId: event.id,
          stripeEventCreatedAt: stripeEventCreatedDate(event)
        });
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as SubscriptionWithPeriods;
      const userId = await getSubscriptionUserId(subscription);
      if (userId) {
        const price = subscription.items.data[0]?.price ?? null;
        const plan = getPlanByStripePriceId(price?.id);
        await applySubscriptionLifecycleEvent({
          userId,
          subscriptionId: subscription.id,
          plan: subscription.metadata.plan ?? plan?.id ?? "unknown",
          subscriptionStatus: "canceled",
          creditStatus: "canceled",
          currentPeriodStart: subscriptionPeriodStart(subscription),
          currentPeriodEnd: subscriptionPeriodEnd(subscription),
          cancelAtPeriodEnd: true,
          clearSubscriptionCredits: true,
          stripeEventId: event.id,
          stripeEventCreatedAt: stripeEventCreatedDate(event)
        });
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as InvoiceWithSubscriptionDetails;
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (subscriptionId) {
        const subscription = await getSubscriptionWithPrice(subscriptionId);
        const userId = await getSubscriptionUserId(subscription);
        if (userId) {
          await applySubscriptionLifecycleEvent({
            userId,
            subscriptionId,
            plan: subscription.metadata.plan ?? "unknown",
            subscriptionStatus: subscription.status,
            creditStatus: "past_due",
            currentPeriodStart: subscriptionPeriodStart(subscription, invoice),
            currentPeriodEnd: subscriptionPeriodEnd(subscription, invoice),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            stripeEventId: event.id,
            stripeEventCreatedAt: stripeEventCreatedDate(event)
          });
        }
      }
    }
  } catch (error) {
    await reportError(error, {
      area: "stripe.webhook",
      stripeEventId: event.id,
      stripeEventType: event.type,
      throttleKey: `stripe.webhook:${event.type}`
    });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
