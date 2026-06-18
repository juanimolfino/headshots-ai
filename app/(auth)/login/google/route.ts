import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAppUrl } from "@/lib/app-url";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const appUrl = getAppUrl(requestUrl.origin);
  const cookiesToApply: CookieToSet[] = [];
  if (requestUrl.searchParams.get("legal_consent") !== "1") {
    const loginUrl = new URL("/login", appUrl);
    loginUrl.searchParams.set("error", "Accept the terms and privacy policy to continue.");
    return NextResponse.redirect(loginUrl);
  }

  const callbackUrl = new URL("/callback", appUrl);
  callbackUrl.searchParams.set("legal_consent", "1");
  callbackUrl.searchParams.set("terms_version", requestUrl.searchParams.get("terms_version") ?? "");
  callbackUrl.searchParams.set("privacy_version", requestUrl.searchParams.get("privacy_version") ?? "");

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
            cookiesToApply.push({ name, value, options });
          });
        }
      }
    }
  );

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      queryParams: {
        access_type: "offline",
        prompt: "select_account"
      }
    }
  });

  if (error || !data.url) {
    const loginUrl = new URL("/login", appUrl);
    loginUrl.searchParams.set("error", error?.message ?? "Could not start Google sign in");
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.redirect(data.url);
  cookiesToApply.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, { ...options, path: "/" });
  });
  return response;
}
