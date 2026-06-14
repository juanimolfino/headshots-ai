import { LegalDraftPage } from "@/components/legal/legal-draft-page";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalDraftPage title="Terms of Service">
      <p>Placeholder para términos de uso. Debe cubrir cuenta, pagos, créditos, uso permitido, límites del servicio, propiedad/licencias de outputs, cancelaciones y contacto de soporte.</p>
      <p>Este texto no es definitivo y no debe considerarse asesoramiento legal.</p>
    </LegalDraftPage>
  );
}
