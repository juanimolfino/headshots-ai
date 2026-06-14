import { LegalDraftPage } from "@/components/legal/legal-draft-page";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalDraftPage title="Privacy Policy">
      <p>Placeholder para política de privacidad. Debe cubrir datos de cuenta, fotos fuente, modelos LoRA, imágenes generadas, pagos, proveedores externos, retención, borrado y derechos del usuario.</p>
      <p>Este texto no es definitivo y no debe considerarse asesoramiento legal.</p>
    </LegalDraftPage>
  );
}
