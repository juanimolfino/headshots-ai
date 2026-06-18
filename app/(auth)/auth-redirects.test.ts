import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("auth redirects", () => {
  it("uses the canonical app URL for magic links, OAuth, and callback redirects", () => {
    const loginPage = read("app/(auth)/login/page.tsx");
    const loginForm = read("components/auth/login-form.tsx");
    const googleRoute = read("app/(auth)/login/google/route.ts");
    const callbackRoute = read("app/(auth)/callback/route.ts");

    expect(loginPage).toContain("getAppUrl()");
    expect(loginPage).toContain("appUrl={getAppUrl()}");
    expect(loginForm).toContain('new URL("/callback", appUrl)');
    expect(loginForm).not.toContain("window.location.origin");
    expect(googleRoute).toContain("getAppUrl(requestUrl.origin)");
    expect(googleRoute).toContain('new URL("/callback", appUrl)');
    expect(callbackRoute).toContain("getAppUrl(requestUrl.origin)");
    expect(callbackRoute).toContain('new URL("/dashboard", appUrl)');
    expect(callbackRoute).not.toContain('new URL("/dashboard", request.url)');
  });
});
