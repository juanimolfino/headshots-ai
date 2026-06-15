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
});
