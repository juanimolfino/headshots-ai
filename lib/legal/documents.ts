import { readFileSync } from "node:fs";
import { join } from "node:path";
import { legalPlaceholderValues } from "@/lib/legal/company-info";

export type LegalDocumentId = "terms" | "privacy" | "refund" | "cookies";

export const legalDocuments: Record<LegalDocumentId, { title: string; filename: string; path: string }> = {
  terms: {
    title: "Terms of Service",
    filename: "terms-of-service.md",
    path: "/terms"
  },
  privacy: {
    title: "Privacy Policy",
    filename: "privacy-policy.md",
    path: "/privacy"
  },
  refund: {
    title: "Refund Policy",
    filename: "refund-policy.md",
    path: "/refund-policy"
  },
  cookies: {
    title: "Cookie Policy",
    filename: "cookie-policy.md",
    path: "/cookies"
  }
};

export function applyLegalPlaceholders(markdown: string) {
  return Object.entries(legalPlaceholderValues).reduce(
    (current, [placeholder, value]) => current.replaceAll(placeholder, value),
    markdown
  );
}

export function getLegalDocumentMarkdown(documentId: LegalDocumentId) {
  const document = legalDocuments[documentId];
  const raw = readFileSync(join(process.cwd(), "docs/legal/documentos", document.filename), "utf8");
  return applyLegalPlaceholders(raw);
}
