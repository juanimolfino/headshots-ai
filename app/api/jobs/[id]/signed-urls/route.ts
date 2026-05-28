import { NextResponse, type NextRequest } from "next/server";
import { normalizeStoragePath } from "@/lib/ai/storage";
import { ensureUserProfile, getJobForUser } from "@/lib/db/queries";
import { getSupabaseAdmin, createSupabaseServerClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

function uniquePaths(paths: string[]) {
  return Array.from(new Set(paths));
}

async function listHeadshotPaths(input: { bucket: string; userId: string; jobId: string }) {
  const folder = `headshots/${input.userId}/${input.jobId}`;
  const { data, error } = await getSupabaseAdmin()
    .storage
    .from(input.bucket)
    .list(folder, { limit: 20, sortBy: { column: "name", order: "asc" } });

  if (error) return [];
  return (data ?? [])
    .filter((item) => item.name.toLowerCase().endsWith(".jpg"))
    .map((item) => `${folder}/${item.name}`);
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await ensureUserProfile(user);
  const { id } = await params;
  const job = await getJobForUser(id, profile.id);
  if (!job) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (job.type !== "headshot-generate" || job.status !== "done") {
    return NextResponse.json({ error: "Headshot job is not ready" }, { status: 400 });
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "ai-results";
  const resultUrls = Array.isArray(job.result) ? job.result.filter((value): value is string => typeof value === "string") : [];
  const resultPaths = resultUrls
    .map((url) => normalizeStoragePath(url, bucket))
    .filter((path): path is string => Boolean(path));
  const listedPaths = await listHeadshotPaths({ bucket, userId: job.userId, jobId: job.id });
  const paths = uniquePaths([...resultPaths, ...listedPaths]);

  if (!paths.length) {
    return NextResponse.json({ error: "No headshot results found" }, { status: 404 });
  }

  const { data, error } = await getSupabaseAdmin()
    .storage
    .from(bucket)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    signedUrls: data.map((item) => item.signedUrl).filter((url): url is string => Boolean(url))
  });
}
