import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Iniciar sesión" };

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.912 5.813a2 2 0 001.272 1.272L21 12l-5.816 1.916a2 2 0 00-1.272 1.272L12 21l-1.912-5.812a2 2 0 00-1.272-1.272L3 12l5.816-1.916a2 2 0 001.272-1.272L12 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Headshots AI</h1>
          <p className="mt-2 text-sm text-zinc-500">Iniciá sesión para generar tus headshots</p>
        </div>
        <LoginForm initialMessage={error} />
      </div>
    </main>
  );
}
