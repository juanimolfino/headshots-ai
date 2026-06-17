import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { publicPageMetadata, siteConfig } from "@/lib/seo";

export const metadata: Metadata = publicPageMetadata({
  title: `Refund Policy | ${siteConfig.name}`,
  description: `Review ${siteConfig.name}'s refund policy for subscriptions, credit packs, failed jobs, unusable AI outputs, and support requests.`,
  path: "/refund-policy"
});

export default function RefundPolicyPage() {
  return <LegalDocumentPage documentId="refund" />;
}
