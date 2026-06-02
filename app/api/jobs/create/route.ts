import { NextResponse } from "next/server";
import { createJobSchema } from "@/lib/ai/validation";
import { getAiProvider } from "@/lib/ai/providers";
import { createPendingJob, ensureUserProfile, refundJobCredits } from "@/lib/db/queries";
import { checkTrainingRateLimit, releaseJobSlot, reserveJobSlot } from "@/lib/redis/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import type { Job } from "@/lib/db/schema";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validationResult = createJobSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json({ error: validationResult.error.errors }, { status: 400 });
  }

  const profile = await ensureUserProfile(user);
  const provider = getAiProvider(validationResult.data.type);
  const creditsUsed = provider.calculateCredits?.(validationResult.data.input as never) ?? provider.costCredits;
  let reserved = false;
  let job: Job | null = null;

  try {
    // Training jobs get an extra per-user rate limit on top of the concurrency slot
    if (validationResult.data.type === "headshot-training") {
      await checkTrainingRateLimit(profile.id);
    }

    await reserveJobSlot(profile.id);
    reserved = true;

    job = await createPendingJob({
      userId: profile.id,
      type: validationResult.data.type,
      payload: validationResult.data.input,
      creditsUsed
    });

    await inngest.send({
      name: "ai/job.created",
      data: { jobId: job.id }
    });

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    if (reserved) await releaseJobSlot(profile.id);
    if (job) await refundJobCredits(job.id, "Could not enqueue AI worker");
    const message = error instanceof Error ? error.message : "Could not create job";
    const status =
      message === "INSUFFICIENT_CREDITS"
        ? 402
        : message === "RATE_LIMITED" || message === "TRAINING_RATE_LIMITED"
          ? 429
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
