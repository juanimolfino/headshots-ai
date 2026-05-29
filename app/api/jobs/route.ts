import { NextResponse, type NextRequest } from "next/server";
import { ensureUserProfile, listJobsForUser } from "@/lib/db/queries";
import { jobTypeEnum, type Job, type JobType } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_LIMIT = 50;

function serializeJob(job: Job) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    result: job.result ?? null,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null
  };
}

function parseType(value: string | null): JobType | undefined {
  if (!value) return undefined;
  return jobTypeEnum.enumValues.includes(value as JobType) ? (value as JobType) : undefined;
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = parseType(request.nextUrl.searchParams.get("type"));
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT) : 50;
  const profile = await ensureUserProfile(user);
  const jobRows = await listJobsForUser({ userId: profile.id, type, limit });

  return NextResponse.json({ jobs: jobRows.map(serializeJob) });
}
