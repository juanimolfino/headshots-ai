import { FAQ, PLANS } from "@/lib/content";

// FAQPage + Product structured data. Rendered server-side in <head> via the
// page component so crawlers see it without running JS.
export function StructuredData() {
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
    name: "headshotly.pro AI Headshot Generator",
    description:
      "Upload your selfies and get professional AI headshots for LinkedIn, resumes, and your website. Personal model trained on your face. Ready in 10 minutes.",
    brand: { "@type": "Brand", name: "headshotly.pro" },
    offers: [
      {
        "@type": "Offer",
        name: PLANS.starter.name,
        price: "5.90",
        priceCurrency: "USD",
        description:
          "20 blue credits, generic AI generation, 3 styles, high-resolution download.",
        availability: "https://schema.org/InStock",
      },
      {
        "@type": "Offer",
        name: PLANS.pro.name,
        price: "11.90",
        priceCurrency: "USD",
        description:
          "1 golden credit to train a personal model plus 20 blue credits to generate headshots of your face.",
        availability: "https://schema.org/InStock",
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />
    </>
  );
}
