import { FAQ, PLANS } from "@/lib/landing-content";

// FAQPage + Product structured data. Render server-side para que los crawlers
// lo vean sin ejecutar JS. name/brand = "Headshots AI".
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
    name: "Headshots AI — AI Headshot Generator",
    description:
      "Upload your selfies and get professional AI headshots for LinkedIn, resumes, and your website. Personal model trained on your face. Ready in 10 minutes.",
    brand: { "@type": "Brand", name: "Headshots AI" },
    offers: [
      {
        "@type": "Offer",
        name: PLANS.starter.name,
        price: "7.99",
        priceCurrency: "USD",
        description:
          "Monthly plan with 1 golden credit to train a personal model and 30 blue credits for headshots and edits.",
        availability: "https://schema.org/InStock",
      },
      {
        "@type": "Offer",
        name: PLANS.pro.name,
        price: "14.99",
        priceCurrency: "USD",
        description:
          "Monthly plan with 2 golden credits to train personal models and 70 blue credits for headshots and edits.",
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
