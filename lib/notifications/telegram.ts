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

export async function sendTelegramPaymentNotification(input: TelegramPaymentNotification) {
  if (!hasTelegramConfig()) return false;

  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildPaymentMessage(input)
      }),
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      console.warn(`Telegram payment notification failed with status ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Telegram error";
    console.warn(`Telegram payment notification failed: ${message}`);
    return false;
  }
}
