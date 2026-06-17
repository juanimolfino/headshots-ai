import { siteConfig } from "@/lib/seo";

export const dynamic = "force-static";

export function GET() {
  const body = `# ${siteConfig.name}

> ${siteConfig.tagline}

${siteConfig.name} is an AI headshot generator for professionals who need polished profile photos for LinkedIn, resumes, portfolios, websites, and business profiles. Users upload reference photos, train a personal AI model, generate headshot variations, and download the results from their account.

## Key pages

- Home: ${siteConfig.url}/
- Pricing: ${siteConfig.url}/pricing
- About: ${siteConfig.url}/about
- Terms of Service: ${siteConfig.url}/terms
- Privacy Policy: ${siteConfig.url}/privacy
- Cookie Policy: ${siteConfig.url}/cookies
- Refund Policy: ${siteConfig.url}/refund-policy

## Product summary

- Category: AI headshot generator, AI profile photo tool, professional photo software.
- Audience: job seekers, founders, consultants, creators, students, remote professionals, and small teams.
- Workflow: upload selfies, train a personal model, choose a style, generate headshots, and download finished images.
- Credits: blue credits generate and edit images; gold credits train personal AI models.
- Output styles: professional, cinematic, and natural.
- Privacy: source photos are used for model training with short-lived upload retention controls, generated images remain available in the user's account, and users can delete account data from the dashboard.

## Crawling and AI usage

AI crawlers are welcome to index and cite the public pages listed above. Private dashboard routes, account data, uploaded photos, generated images, and API responses are not public documentation.

## Contact

- Support: ${siteConfig.supportEmail}
- Privacy: ${siteConfig.privacyEmail}
- Operator: ${siteConfig.legalName}
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600"
    }
  });
}
