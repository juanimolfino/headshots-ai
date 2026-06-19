import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("Stripe customer reuse in billing flows", () => {
  it("uses the shared customer resolver in checkout and billing portal", () => {
    const checkout = read("app/api/stripe/checkout/route.ts");
    const portal = read("app/api/stripe/portal/route.ts");
    const helper = read("lib/stripe/customer.ts");

    expect(checkout).toContain("ensureStripeCustomerForUser(profile)");
    expect(checkout).toContain("customer: customerId");
    expect(portal).toContain("ensureStripeCustomerForUser(profile, { allowCreate: false })");
    expect(portal).toContain("export async function GET");
    expect(portal).toContain("customer: customerId");
    expect(helper).toContain("if (profile.stripeCustomerId) return profile.stripeCustomerId");
  });
});
