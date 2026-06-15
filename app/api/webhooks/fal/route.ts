import { type NextRequest, NextResponse } from "next/server";
import { verifyFalWebhookSignature } from "@/lib/fal/webhook-verification";
import { inngest } from "@/lib/inngest/client";
import { logInfo, logWarn } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";

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
  const startedAt = Date.now();
  const rawBody = await request.text();
  const signatureResult = await verifyFalWebhookSignature(rawBody, request.headers);

  if (!signatureResult.ok) {
    logWarn("fal_webhook_signature_rejected", {
      area: "fal.webhook",
      route: "/api/webhooks/fal",
      falRequestId: signatureResult.falRequestId,
      reason: signatureResult.reason
    });
  }

  // Temporary transition fallback. Fal's official ED25519 signature is preferred.
  // Remove this once FAL_WEBHOOK_LEGACY_SECRET no longer appears in production logs
  // for a full training retry window plus operational buffer.
  const configuredSecret = process.env.FAL_WEBHOOK_SECRET;
  if (!signatureResult.ok && configuredSecret) {
    const incomingSecret = request.nextUrl.searchParams.get("secret") ?? "";
    if (!safeEqual(incomingSecret, configuredSecret)) {
      logWarn("fal_webhook_rejected", {
        area: "fal.webhook",
        route: "/api/webhooks/fal",
        reason: "invalid_signature_and_legacy_secret"
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logWarn("fal_webhook_legacy_secret_fallback", {
      area: "fal.webhook",
      route: "/api/webhooks/fal",
      code: "FAL_WEBHOOK_LEGACY_SECRET"
    });
  } else if (!signatureResult.ok && process.env.NODE_ENV === "production") {
    await reportError(new Error("FAL_WEBHOOK_SECRET is not configured in production"), {
      area: "fal.webhook",
      route: "/api/webhooks/fal",
      throttleKey: "fal-webhook-secret-missing"
    });
    return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 500 });
  }

  let body: FalWebhookBody;
  try {
    body = JSON.parse(rawBody) as FalWebhookBody;
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

  logInfo("fal_webhook_received", {
    area: "fal.webhook",
    route: "/api/webhooks/fal",
    falRequestId: requestId,
    status,
    verification: signatureResult.ok ? "jwks" : "legacy_secret",
    durationMs: Date.now() - startedAt
  });

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
