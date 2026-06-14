import { NextResponse } from "next/server";
import { ensureUserProfile, recordUserConsent } from "@/lib/db/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { legal?: unknown; photoProcessing?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const legal = body.legal === true;
  const photoProcessing = body.photoProcessing === true;
  if (!legal && !photoProcessing) {
    return NextResponse.json({ error: "No consent selected" }, { status: 400 });
  }

  const profile = await ensureUserProfile(user);
  await recordUserConsent(profile.id, { legal, photoProcessing });

  return NextResponse.json({ success: true });
}
