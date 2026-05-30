import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";

type FalWebhookBody = {
  request_id?: string;
  status?: string;
  payload?: unknown;
  error?: unknown;
};

export async function POST(request: Request) {
  let body: FalWebhookBody;
  try {
    body = await request.json() as FalWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requestId = body.request_id;
  if (!requestId) {
    return NextResponse.json({ error: "Missing request_id" }, { status: 400 });
  }

  console.log("[fal-webhook] received:", requestId, "status:", body.status);

  await inngest.send({
    name: `fal/training.${requestId}`,
    data: {
      status: body.status ?? "UNKNOWN",
      payload: body.payload ?? null,
      error: body.error ?? null
    }
  });

  return NextResponse.json({ ok: true });
}
