import { reportError } from "@/lib/observability/report-error";

type CreditGrant = {
  blue: number;
  gold: number;
};

type IntegrityInput = {
  userId?: string | null;
  userLabel?: string | null;
  plan: string;
  stripeEventId: string;
  stripeEventType: string;
  subscriptionId: string;
  invoiceId?: string | null;
  priceId?: string | null;
  expectedCredits: CreditGrant;
  actualCredits?: CreditGrant | null;
  report?: typeof reportError;
};

function sameGrant(expected: CreditGrant, actual: CreditGrant) {
  return expected.blue === actual.blue && expected.gold === actual.gold;
}

export async function verifySubscriptionGrantIntegrity(input: IntegrityInput) {
  const report = input.report ?? reportError;
  const expectedTotal = input.expectedCredits.blue + input.expectedCredits.gold;

  if (!input.userId) {
    await report(new Error("Stripe subscription payment could not be attributed to a user"), {
      area: "stripe.webhook.subscription-grant-integrity",
      stripeEventId: input.stripeEventId,
      stripeEventType: input.stripeEventType,
      subscriptionId: input.subscriptionId,
      invoiceId: input.invoiceId,
      priceId: input.priceId,
      plan: input.plan,
      userId: input.userId ?? null,
      userLabel: input.userLabel ?? null,
      expectedCredits: input.expectedCredits,
      actualCredits: input.actualCredits ?? null,
      throttleKey: `stripe.subscription-integrity:missing-user:${input.subscriptionId}:${input.stripeEventId}`
    });
    return false;
  }

  if (!input.actualCredits || expectedTotal <= 0 || !sameGrant(input.expectedCredits, input.actualCredits)) {
    await report(new Error("Stripe subscription payment and credited balances are inconsistent"), {
      area: "stripe.webhook.subscription-grant-integrity",
      stripeEventId: input.stripeEventId,
      stripeEventType: input.stripeEventType,
      subscriptionId: input.subscriptionId,
      invoiceId: input.invoiceId,
      priceId: input.priceId,
      plan: input.plan,
      userId: input.userId,
      userLabel: input.userLabel ?? null,
      expectedCredits: input.expectedCredits,
      actualCredits: input.actualCredits ?? null,
      throttleKey: `stripe.subscription-integrity:mismatch:${input.subscriptionId}:${input.stripeEventId}`
    });
    return false;
  }

  return true;
}
