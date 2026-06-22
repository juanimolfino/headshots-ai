type TelegramPaymentNotification = {
  customerName?: string | null;
  customerEmail?: string | null;
  itemName: string;
  paymentType: "Pack" | "Subscription";
  amountCents: number;
  currency?: string | null;
  credits?: {
    blue: number;
    gold: number;
  };
};

type TelegramSubscriptionNotification = {
  customerName?: string | null;
  customerEmail?: string | null;
  subscriptionType: "New subscription" | "Subscription renewal";
  itemName: string;
  amountCents: number;
  currency?: string | null;
  credits: {
    blue: number;
    gold: number;
  };
};

type TelegramSignupNotification = {
  userName?: string | null;
  userEmail?: string | null;
  credits: {
    blue: number;
    gold: number;
  };
};

type TelegramErrorAlert = {
  area: string;
  message: string;
  severity?: "critical" | "warning";
  context?: Record<string, unknown>;
  fingerprint?: string;
};

function hasTelegramConfig() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function formatMoney(amountCents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(amountCents / 100);
}

function customerLabel(input: TelegramPaymentNotification) {
  return input.customerName || input.customerEmail || "Unknown customer";
}

function buildPaymentMessage(input: TelegramPaymentNotification) {
  const credits = input.credits
    ? `\nCredits: ${input.credits.blue} blue, ${input.credits.gold} gold`
    : "";

  return [
    "New Stripe payment",
    `Customer: ${customerLabel(input)}`,
    `Type: ${input.paymentType}`,
    `Plan/pack: ${input.itemName}`,
    `Amount: ${formatMoney(input.amountCents, input.currency ?? "usd")}${credits}`
  ].join("\n");
}

export function buildSubscriptionMessage(input: TelegramSubscriptionNotification) {
  return [
    input.subscriptionType === "New subscription" ? "New Stripe subscription" : "Stripe subscription renewed",
    `Customer: ${input.customerName || input.customerEmail || "Unknown customer"}`,
    `Plan: ${input.itemName}`,
    `Amount: ${formatMoney(input.amountCents, input.currency ?? "usd")}`,
    `Credits applied: ${input.credits.blue} blue, ${input.credits.gold} gold`
  ].join("\n");
}

export function buildSignupMessage(input: TelegramSignupNotification) {
  return [
    "New user signup",
    `User: ${input.userName || input.userEmail || "Unknown user"}`,
    ...(input.userEmail && input.userName ? [`Email: ${input.userEmail}`] : []),
    `Free credits granted: ${input.credits.blue} blue, ${input.credits.gold} gold`
  ].join("\n");
}

function formatContextValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildErrorAlertMessage(input: TelegramErrorAlert) {
  const contextLines = Object.entries(input.context ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${formatContextValue(value)}`);

  const lines = [
    "🚨 ALERTA OPERATIVA",
    `Severity: ${input.severity ?? "critical"}`,
    `Area: ${input.area}`,
    `Error: ${input.message}`,
    ...(input.fingerprint ? [`Fingerprint: ${input.fingerprint}`] : []),
    ...contextLines
  ];

  return lines.join("\n").slice(0, 3900);
}

async function sendTelegramMessage(text: string, label: string) {
  if (!hasTelegramConfig()) return false;

  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text
      }),
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      console.warn(`Telegram ${label} notification failed with status ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Telegram error";
    console.warn(`Telegram ${label} notification failed: ${message}`);
    return false;
  }
}

export async function sendTelegramPaymentNotification(input: TelegramPaymentNotification) {
  return sendTelegramMessage(buildPaymentMessage(input), "payment");
}

export async function sendTelegramSubscriptionNotification(input: TelegramSubscriptionNotification) {
  return sendTelegramMessage(buildSubscriptionMessage(input), "subscription");
}

export async function sendTelegramSignupNotification(input: TelegramSignupNotification) {
  return sendTelegramMessage(buildSignupMessage(input), "signup");
}

export async function sendTelegramErrorAlert(input: TelegramErrorAlert) {
  return sendTelegramMessage(buildErrorAlertMessage(input), "error alert");
}
