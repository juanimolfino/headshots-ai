import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/seo";

const aiCrawlerUserAgents = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "GoogleOther",
  "GoogleOther-Image",
  "GoogleOther-Video",
  "Applebot",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "FacebookBot",
  "meta-externalagent",
  "YouBot",
  "Diffbot",
  "cohere-ai",
  "Amazonbot"
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      ...aiCrawlerUserAgents.map((userAgent) => ({ userAgent, allow: "/" }))
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`
  };
}
