import { type NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";

type FalWebhookBody = {
  request_id?: string;
  status?: string;
  payload?: unknown;
  error?: unknown;
};

// Constant-time string comparison to prevent timing attacks
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: NextRequest) {
  // Verify the shared secret embedded as a query param in the webhook URL.
  // The secret is injected when submitting to fal.ai: /api/webhooks/fal?secret=xxx
  // If FAL_WEBHOOK_SECRET is configured, the incoming request MUST match.
  const configuredSecret = process.env.FAL_WEBHOOK_SECRET;
  if (configuredSecret) {
    const incomingSecret = request.nextUrl.searchParams.get("secret") ?? "";
    if (!safeEqual(incomingSecret, configuredSecret)) {
      console.warn("[fal-webhook] rejected: invalid or missing secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Warn but allow through so existing deployments don't break before the env var is set
    console.warn("[fal-webhook] FAL_WEBHOOK_SECRET not set — webhook is unauthenticated");
  }

  let body: FalWebhookBody;
  try {
    body = (await request.json()) as FalWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requestId = body.request_id;
  if (!requestId || typeof requestId !== "string" || requestId.length > 200) {
    return NextResponse.json({ error: "Missing or invalid request_id" }, { status: 400 });
  }

  // Validate status field
  const allowedStatuses = new Set(["OK", "ERROR", "UNKNOWN"]);
  const status = typeof body.status === "string" && allowedStatuses.has(body.status)
    ? body.status
    : "UNKNOWN";

  console.log("[fal-webhook] received:", requestId, "status:", status);

  await inngest.send({
    name: `fal/training.${requestId}`,
    data: {
      status,
      payload: body.payload ?? null,
      error: body.error ?? null
    }
  });

  return NextResponse.json({ ok: true });
}
