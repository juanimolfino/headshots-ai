import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("Stripe billing endpoint rate limits", () => {
  it("rate limits checkout and billing portal session creation", () => {
    expect(read("app/api/stripe/checkout/route.ts")).toContain("checkCheckoutRateLimit(profile.id)");
    expect(read("app/api/stripe/portal/route.ts")).toContain("checkBillingPortalRateLimit(profile.id)");
    expect(read("lib/redis/rate-limit.ts")).toContain("CHECKOUT_RATE_LIMITED");
    expect(read("lib/redis/rate-limit.ts")).toContain("BILLING_PORTAL_RATE_LIMITED");
  });
});
