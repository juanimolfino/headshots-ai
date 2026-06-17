import type { Metadata } from "next";
import { legalCompanyInfo } from "@/lib/legal/company-info";

const siteUrl = legalCompanyInfo.websiteUrl.replace(/\/+$/, "");
const defaultOgImagePath = "/opengraph-image";

export const siteConfig = {
  name: legalCompanyInfo.brandName,
  legalName: legalCompanyInfo.legalEntityName,
  url: siteUrl,
  contactEmail: legalCompanyInfo.contactEmail,
  supportEmail: legalCompanyInfo.supportEmail,
  privacyEmail: legalCompanyInfo.privacyEmail,
  address: legalCompanyInfo.businessAddress,
  defaultTitle: `${legalCompanyInfo.brandName} - AI Headshot Generator`,
  defaultDescription:
    "Create professional AI headshots for LinkedIn, resumes, portfolios, and business profiles using your own photos.",
  tagline: "Professional AI headshots from your own photos."
} as const;

export function absoluteUrl(path = "/") {
  if (/^https?:\/\//i.test(path)) return path;
  return `${siteConfig.url}${path.startsWith("/") ? path : `/${path}`}`;
}

export function publicPageMetadata({
  title,
  description,
  path,
  type = "website",
  image = defaultOgImagePath
}: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  image?: string;
}): Metadata {
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(image);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: siteConfig.name,
      type,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${siteConfig.name} preview`
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl]
    }
  };
}
