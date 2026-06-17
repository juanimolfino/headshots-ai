import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { publicPageMetadata, siteConfig } from "@/lib/seo";

export const metadata: Metadata = publicPageMetadata({
  title: `Terms of Service | ${siteConfig.name}`,
  description: `Read the terms that govern access to ${siteConfig.name}, including subscriptions, credits, AI generation, account use, and data deletion.`,
  path: "/terms"
});

export default function TermsPage() {
  return <LegalDocumentPage documentId="terms" />;
}
