import { afterEach, describe, expect, it, vi } from "vitest";
import { getHealthEnvStatus } from "@/lib/health/checks";

describe("health integration env status", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports missing integration variables without exposing secret values", () => {
    vi.stubEnv("FAL_KEY", "fal-key");
    vi.stubEnv("FAL_ADMIN_KEY", "");
    vi.stubEnv("FAL_WEBHOOK_SECRET", "secret");

    const status = getHealthEnvStatus();

    expect(status.fal.status).toBe("missing");
    expect(status.fal.missing).toEqual(["FAL_ADMIN_KEY"]);
    expect(JSON.stringify(status)).not.toContain("fal-key");
    expect(JSON.stringify(status)).not.toContain("secret");
  });
});
