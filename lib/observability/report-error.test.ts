import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  sendTelegramErrorAlert: vi.fn(async () => true),
  checkRateLimit: vi.fn(async () => undefined)
}));

vi.mock("@/lib/notifications/telegram", () => ({
  sendTelegramErrorAlert: mocks.sendTelegramErrorAlert
}));

vi.mock("@/lib/redis/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit
}));

import { reportError } from "@/lib/observability/report-error";

describe("reportError", () => {
  beforeEach(() => {
    mocks.sendTelegramErrorAlert.mockClear();
    mocks.checkRateLimit.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs structured errors and sends Telegram alerts", async () => {
    const payload = await reportError(new Error("stripe failed"), {
      area: "stripe.webhook",
      stripeEventId: "evt_123",
      throttleKey: "test-report-error-alert"
    });

    expect(payload).toMatchObject({
      level: "error",
      code: "APP_ERROR",
      severity: "critical",
      context: {
        area: "stripe.webhook",
        stripeEventId: "evt_123"
      }
    });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"code":"APP_ERROR"'));
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(expect.stringContaining("alerts:error:"), 1, 300);
    expect(mocks.sendTelegramErrorAlert).toHaveBeenCalledWith(expect.objectContaining({
      area: "stripe.webhook",
      message: "stripe failed"
    }));
  });

  it("throttles repeated Telegram alerts by fingerprint", async () => {
    const context = { area: "inngest.run-ai-job", throttleKey: "same-alert-fingerprint" };

    await reportError(new Error("same failure"), context);
    await reportError(new Error("same failure"), context);

    expect(mocks.sendTelegramErrorAlert).toHaveBeenCalledTimes(1);
  });
});
