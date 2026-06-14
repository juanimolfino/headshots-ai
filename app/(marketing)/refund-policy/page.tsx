import { LegalDraftPage } from "@/components/legal/legal-draft-page";

export const metadata = { title: "Refund Policy" };

export default function RefundPolicyPage() {
  return (
    <LegalDraftPage title="Refund Policy">
      <p>Placeholder para política de reembolsos. Debe cubrir créditos, suscripciones, fallos técnicos, trabajos reembolsados automáticamente y casos que requieren soporte.</p>
      <p>Este texto no es definitivo y no debe considerarse asesoramiento legal.</p>
    </LegalDraftPage>
  );
}
