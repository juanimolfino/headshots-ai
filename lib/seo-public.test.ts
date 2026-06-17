import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("public SEO and GEO configuration", () => {
  it("keeps reveal content visible by default for crawlers", () => {
    const css = read("app/globals.css");
    const landing = read("app/(marketing)/page.tsx");
    const reveal = read("components/marketing/reveal.tsx");

    expect(landing).not.toContain('className="js ');
    expect(css).not.toContain(".js .reveal");
    expect(css).toContain(".reveal.ready");
    expect(reveal).toContain('el.classList.add("ready")');
    expect(reveal).toContain('className={`reveal${delayClass}');
  });

  it("defines public metadata, sitemap, robots, and llms.txt coverage", () => {
    const layout = read("app/layout.tsx");
    const sitemap = read("app/sitemap.ts");
    const robots = read("app/robots.ts");
    const llms = read("app/llms.txt/route.ts");

    expect(layout).toContain("manifest: \"/manifest.webmanifest\"");
    expect(layout).toContain("twitter:");
    expect(sitemap).toContain("/about");
    expect(robots).toContain("GPTBot");
    expect(robots).toContain("PerplexityBot");
    expect(llms).toContain("AI crawlers are welcome");
    expect(llms).toContain("/pricing");
  });

  it("serves an about page and expanded structured data", () => {
    const about = read("app/(marketing)/about/page.tsx");
    const structuredData = read("components/marketing/structured-data.tsx");
    const pricing = read("app/(marketing)/pricing/page.tsx");

    expect(about).toContain("publicPageMetadata");
    expect(about).toContain("Company information");
    expect(structuredData).toContain('"@type": "Organization"');
    expect(structuredData).toContain('"@type": "WebApplication"');
    expect(structuredData).toContain('"@type": "WebSite"');
    expect(pricing).toContain("PricingStructuredData");
  });
});
