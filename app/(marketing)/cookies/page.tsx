import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { publicPageMetadata, siteConfig } from "@/lib/seo";

export const metadata: Metadata = publicPageMetadata({
  title: `Cookie Policy | ${siteConfig.name}`,
  description: `Understand how ${siteConfig.name} uses cookies and similar technologies for authentication, payments, analytics, and product operations.`,
  path: "/cookies"
});

export default function CookiePolicyPage() {
  return <LegalDocumentPage documentId="cookies" />;
}
