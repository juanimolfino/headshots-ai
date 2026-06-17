import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { publicPageMetadata, siteConfig } from "@/lib/seo";

export const metadata: Metadata = publicPageMetadata({
  title: `Privacy Policy | ${siteConfig.name}`,
  description: `Learn how ${siteConfig.name} handles account data, uploaded photos, generated images, payments, subprocessors, retention, and deletion requests.`,
  path: "/privacy"
});

export default function PrivacyPage() {
  return <LegalDocumentPage documentId="privacy" />;
}
