import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { ensureUserProfile, recordUserConsent } from "@/lib/db/queries";
import { getAppUrl } from "@/lib/app-url";
import { LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION } from "@/lib/legal/consent";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const appUrl = getAppUrl(requestUrl.origin);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");
  const loginUrl = new URL("/login", appUrl);
  const dashboardUrl = new URL("/dashboard", appUrl);

  if (error || !code) {
    loginUrl.searchParams.set("error", error ?? "Missing auth code");
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.redirect(dashboardUrl);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, { ...options, path: "/" });
          });
        }
      }
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    loginUrl.searchParams.set("error", exchangeError.message);
    return NextResponse.redirect(loginUrl);
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    loginUrl.searchParams.set("error", "Could not load authenticated user");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const profile = await ensureUserProfile(user);
    if (
      requestUrl.searchParams.get("legal_consent") === "1" &&
      requestUrl.searchParams.get("terms_version") === LEGAL_TERMS_VERSION &&
      requestUrl.searchParams.get("privacy_version") === LEGAL_PRIVACY_VERSION
    ) {
      await recordUserConsent(profile.id, { legal: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown profile setup error";
    console.error("Auth callback profile setup failed", { message });
    loginUrl.searchParams.set("error", `Profile setup failed: ${message}`);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
