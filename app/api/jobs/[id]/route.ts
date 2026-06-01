import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { ensureUserProfile, getJobForUser } from "@/lib/db/queries";
import { jobs } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await ensureUserProfile(user);
  const { id } = await params;
  const job = await getJobForUser(id, profile.id);
  if (!job) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  console.log("[api/jobs/:id] status:", JSON.stringify({
    id: job.id,
    type: job.type,
    status: job.status,
    hasResult: Boolean(job.result),
    error: job.error
  }));

  return NextResponse.json({
    id: job.id,
    type: job.type,
    status: job.status,
    result: job.result ?? null,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await ensureUserProfile(user);
  const { id } = await params;
  const job = await getJobForUser(id, profile.id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.type !== "headshot-training") {
    return NextResponse.json({ error: "Only training jobs can be renamed" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const raw = (body as { name?: unknown }).name;
  const name = typeof raw === "string" ? raw.trim().slice(0, 60) : null;
  if (!name) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  await getDb()
    .update(jobs)
    .set({ input: { ...job.input, name }, updatedAt: new Date() })
    .where(eq(jobs.id, id));

  return NextResponse.json({ success: true });
}
