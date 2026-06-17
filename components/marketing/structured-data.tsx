import { FAQ, PLANS } from "@/lib/landing-content";
import { BLUE_PACKS, GOLD_PACKS, SUBSCRIPTION_PLANS } from "@/lib/stripe/pricing";
import { absoluteUrl, siteConfig } from "@/lib/seo";

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

function offerCatalog() {
  return [...SUBSCRIPTION_PLANS, ...BLUE_PACKS, ...GOLD_PACKS].map((item) => ({
    "@type": "Offer",
    name: item.name,
    price: String("priceMonthly" in item ? item.priceMonthly : item.price),
    priceCurrency: "USD",
    url: absoluteUrl("/pricing"),
    availability: "https://schema.org/InStock",
    description:
      "priceMonthly" in item
        ? `${item.gold} gold credits and ${item.blue} blue credits per month.`
        : `${item.gold} gold credits and ${item.blue} blue credits.`
  }));
}

export function StructuredData() {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    legalName: siteConfig.legalName,
    url: siteConfig.url,
    logo: absoluteUrl("/apple-icon.png"),
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: siteConfig.supportEmail
      },
      {
        "@type": "ContactPoint",
        contactType: "privacy",
        email: siteConfig.privacyEmail
      }
    ],
    address: {
      "@type": "PostalAddress",
      streetAddress: siteConfig.address
    }
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.defaultDescription,
    publisher: {
      "@type": "Organization",
      name: siteConfig.name
    }
  };

  const webApplicationSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: siteConfig.name,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    url: siteConfig.url,
    description: siteConfig.defaultDescription,
    offers: offerCatalog(),
    provider: {
      "@type": "Organization",
      name: siteConfig.name,
      url: siteConfig.url
    }
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${siteConfig.name} AI Headshot Generator`,
    description: siteConfig.defaultDescription,
    brand: { "@type": "Brand", name: siteConfig.name },
    offers: [
      {
        "@type": "Offer",
        name: PLANS.starter.name,
        price: "7.99",
        priceCurrency: "USD",
        url: absoluteUrl("/pricing"),
        description:
          "Monthly plan with 1 golden credit to train a personal model and 30 blue credits for headshots and edits.",
        availability: "https://schema.org/InStock"
      },
      {
        "@type": "Offer",
        name: PLANS.pro.name,
        price: "14.99",
        priceCurrency: "USD",
        url: absoluteUrl("/pricing"),
        description:
          "Monthly plan with 2 golden credits to train personal models and 70 blue credits for headshots and edits.",
        availability: "https://schema.org/InStock"
      }
    ]
  };

  return (
    <>
      <JsonLd data={organizationSchema} />
      <JsonLd data={websiteSchema} />
      <JsonLd data={webApplicationSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={productSchema} />
    </>
  );
}

export function PricingStructuredData() {
  const pricingSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${siteConfig.name} pricing`,
    description:
      "Subscription plans and credit packs for AI headshot generation, quick edits, and personal model training.",
    brand: { "@type": "Brand", name: siteConfig.name },
    offers: offerCatalog()
  };

  return <JsonLd data={pricingSchema} />;
}
