import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  reportError: vi.fn(async () => undefined)
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: mocks.send
  }
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: mocks.reportError
}));

import { POST } from "@/app/api/webhooks/fal/route";

describe("Fal webhook auth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("rejects production webhooks when FAL_WEBHOOK_SECRET is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FAL_WEBHOOK_SECRET", "");

    const request = new NextRequest("https://example.com/api/webhooks/fal", {
      method: "POST",
      body: JSON.stringify({ request_id: "req_123", status: "OK" })
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Webhook secret is not configured" });
    expect(mocks.reportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      area: "fal.webhook",
      route: "/api/webhooks/fal"
    }));
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("accepts legacy query-string secret fallback during transition", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FAL_WEBHOOK_SECRET", "legacy-secret");

    const request = new NextRequest("https://example.com/api/webhooks/fal?secret=legacy-secret", {
      method: "POST",
      body: JSON.stringify({ request_id: "req_legacy", status: "OK" })
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.send).toHaveBeenCalledWith({
      name: "fal/training.req_legacy",
      data: {
        status: "OK",
        payload: null,
        error: null
      }
    });
  });
});
