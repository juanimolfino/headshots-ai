import { NextResponse } from "next/server";
import { deleteAccountData } from "@/lib/account/delete-account";
import { ensureUserProfile } from "@/lib/db/queries";
import { reportError } from "@/lib/observability/report-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.confirm !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm account deletion" }, { status: 400 });
  }

  const profile = await ensureUserProfile(user);
  const result = await deleteAccountData(profile, user.id);
  if (!result.ok) {
    await reportError(new Error("Account deletion completed partially"), {
      area: "account.delete",
      userId: profile.id,
      steps: result.steps,
      retained: result.retained,
      throttleKey: "account-delete-partial"
    });
  }

  const response = NextResponse.json(result, { status: result.ok ? 200 : 207 });
  if (result.ok) {
    response.cookies.delete("sb-access-token");
    response.cookies.delete("sb-refresh-token");
  }
  return response;
}
