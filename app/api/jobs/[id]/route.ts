import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeStoragePath } from "@/lib/ai/storage";
import { getDb } from "@/lib/db";
import { ensureUserProfile, getJobForUser } from "@/lib/db/queries";
import { jobs } from "@/lib/db/schema";
import { createSupabaseServerClient, getSupabaseAdmin } from "@/lib/supabase/server";

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

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await ensureUserProfile(user);
  const { id } = await params;
  const job = await getJobForUser(id, profile.id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Solo se pueden borrar los resultados de Quick GPT edit.
  if (job.type !== "headshot-edit") {
    return NextResponse.json({ error: "Only Quick GPT edits can be deleted" }, { status: 400 });
  }

  // Borrar los archivos del storage (folder del job + URLs guardadas) antes del row.
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "ai-results";
  const admin = getSupabaseAdmin();
  const folder = `headshots/${job.userId}/${job.id}`;
  const paths = new Set<string>();
  const { data: listed } = await admin.storage.from(bucket).list(folder, { limit: 100 });
  for (const item of listed ?? []) paths.add(`${folder}/${item.name}`);
  const resultUrls = Array.isArray(job.result)
    ? job.result.filter((value): value is string => typeof value === "string")
    : [];
  for (const url of resultUrls) {
    const path = normalizeStoragePath(url, bucket);
    if (path) paths.add(path);
  }
  if (paths.size) {
    const { error } = await admin.storage.from(bucket).remove([...paths]);
    if (error) console.error("[api/jobs/:id DELETE] storage remove failed:", error.message);
  }

  await getDb().delete(jobs).where(and(eq(jobs.id, id), eq(jobs.userId, profile.id)));

  return NextResponse.json({ success: true });
}
