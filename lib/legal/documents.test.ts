import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { legalPlaceholderValues } from "@/lib/legal/company-info";
import { LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION, PHOTO_PROCESSING_CONSENT_VERSION } from "@/lib/legal/consent";

const legalDocFiles = [
  "terms-of-service.md",
  "privacy-policy.md",
  "cookie-policy.md",
  "refund-policy.md"
];

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("final legal documents", () => {
  it("centralizes every bracket placeholder used by legal Markdown docs", () => {
    const placeholders = new Set<string>();
    for (const filename of legalDocFiles) {
      const markdown = read(`docs/legal/documentos/${filename}`);
      for (const match of markdown.matchAll(/\[[A-Z0-9 /_-]+\]/g)) placeholders.add(match[0]);
    }

    expect([...placeholders].sort()).toEqual(Object.keys(legalPlaceholderValues).sort());
  });

  it("routes all four final legal documents through the Markdown renderer", () => {
    expect(read("app/(marketing)/terms/page.tsx")).toContain('documentId="terms"');
    expect(read("app/(marketing)/privacy/page.tsx")).toContain('documentId="privacy"');
    expect(read("app/(marketing)/cookies/page.tsx")).toContain('documentId="cookies"');
    expect(read("app/(marketing)/refund-policy/page.tsx")).toContain('documentId="refund"');
    expect(read("components/legal/legal-document-page.tsx")).not.toContain("Borrador");
  });

  it("links legal pages from footer, signup, checkout, and sitemap", () => {
    const landing = read("app/(marketing)/page.tsx");
    const signup = read("components/auth/login-form.tsx");
    const pricing = read("app/(marketing)/pricing/page.tsx");
    const checkout = read("app/api/stripe/checkout/route.ts");
    const sitemap = read("app/sitemap.ts");

    for (const href of ["/terms", "/privacy", "/cookies", "/refund-policy"]) {
      expect(landing).toContain(`href="${href}"`);
      expect(signup).toContain(`href="${href}"`);
      expect(pricing).toContain(`href="${href}"`);
      expect(sitemap).toContain(href);
    }
    expect(checkout).toContain("Cookie Policy");
  });

  it("routes legal documents back to dashboard when the user is authenticated", () => {
    const legalPage = read("components/legal/legal-document-page.tsx");
    const landing = read("app/(marketing)/page.tsx");
    const nav = read("components/marketing/nav.tsx");

    expect(legalPage).toContain('backHref = user ? "/dashboard/headshots" : "/"');
    expect(legalPage).toContain('Back to dashboard');
    expect(landing).toContain("authenticated={authenticated}");
    expect(landing).toContain('href={authenticated ? "/dashboard/headshots" : "/login"}');
    expect(nav).toContain('authenticated = false');
    expect(nav).toContain('href={authenticated ? "/dashboard/headshots" : "#top"}');
    expect(nav).toContain('authenticated ? "/dashboard" : "/login"');
  });

  it("uses published consent versions instead of draft versions", () => {
    expect(LEGAL_TERMS_VERSION).toBe("2026-06-14-v1");
    expect(LEGAL_PRIVACY_VERSION).toBe("2026-06-14-v1");
    expect(PHOTO_PROCESSING_CONSENT_VERSION).toBe("2026-06-14-v1");
  });
});
