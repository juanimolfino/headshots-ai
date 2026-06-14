import Link from "next/link";

export function LegalDraftPage({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14 text-ink">
      <div className="mb-8 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink-soft">
        <b className="font-semibold text-ink">Borrador.</b> Texto legal placeholder pendiente de revisión profesional.
      </div>
      <Link href="/" className="text-sm font-semibold text-navy underline-offset-2 hover:underline">
        Back home
      </Link>
      <h1 className="mt-6 font-serif text-4xl font-medium tracking-[-0.02em]">{title}</h1>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-ink-soft">
        {children}
      </div>
    </main>
  );
}
