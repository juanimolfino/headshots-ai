import { fal } from "@fal-ai/client";
import { getAiProvider } from "@/lib/ai/providers";
import { getAppUrl } from "@/lib/app-url";
import { storeAiResult } from "@/lib/ai/storage";
import { getDb } from "@/lib/db";
import { jobs, users, type JobType } from "@/lib/db/schema";
import { markJobDone, markJobProcessing, refundJobCredits } from "@/lib/db/queries";
import { sendJobReadyEmail } from "@/lib/email/send";
import { releaseJobSlot } from "@/lib/redis/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { generatePhotomakerImageUrls } from "@/lib/ai/providers/photomaker";
import { inngest } from "./client";
import { eq } from "drizzle-orm";
import JSZip from "jszip";

type HeadshotJobInput = {
  archive_url: string;
  style?: "Photographic" | "Cinematic" | "(No style)";
  num_images?: number;
};

type HeadshotJob = {
  id: string;
  userId: string;
  input: Record<string, unknown>;
};

function parseImageUrls(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const urls = parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
    return urls.length === parsed.length ? urls : null;
  } catch {
    return null;
  }
}

function getFilenameFromUrl(url: string, index: number) {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split("/").pop();
    if (filename) return filename;
  } catch {
    // Fall through to generated filename.
  }
  return `photo-${index + 1}.jpg`;
}

async function downloadBytes(url: string, label: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${label}: ${response.status}`);

  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") ?? "application/octet-stream"
  };
}

async function createAndUploadHeadshotArchive(imageUrls: string[]) {
  const zip = new JSZip();
  const images = await Promise.all(
    imageUrls.map(async (url, index) => {
      const downloaded = await downloadBytes(url, `headshot source image ${index + 1}`);
      return {
        filename: getFilenameFromUrl(url, index),
        bytes: downloaded.bytes
      };
    })
  );

  for (const image of images) {
    zip.file(image.filename, image.bytes);
  }

  const archiveBytes = await zip.generateAsync({ type: "arraybuffer" });
  fal.config({ credentials: process.env.FAL_KEY });
  return fal.storage.upload(new File([archiveBytes], "headshot-sources.zip", { type: "application/zip" }));
}

async function storeHeadshotImage(input: {
  userId: string;
  jobId: string;
  index: number;
  imageUrl: string;
}) {
  const downloaded = await downloadBytes(input.imageUrl, `generated headshot ${input.index + 1}`);
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "ai-results";
  const path = `headshots/${input.userId}/${input.jobId}/${input.index}.jpg`;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(bucket).upload(path, downloaded.bytes, {
    upsert: true,
    contentType: downloaded.contentType
  });
  if (error) throw error;

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

async function processHeadshotJob(job: HeadshotJob) {
  const input = job.input as HeadshotJobInput;
  const imageUrls = parseImageUrls(input.archive_url);
  const archiveUrl = imageUrls ? await createAndUploadHeadshotArchive(imageUrls) : input.archive_url;
  const generatedUrls = await generatePhotomakerImageUrls({
    archive_url: archiveUrl,
    style: input.style,
    num_images: input.num_images
  });
  const supabaseUrls = await Promise.all(
    generatedUrls.map((imageUrl, index) =>
      storeHeadshotImage({
        userId: job.userId,
        jobId: job.id,
        index,
        imageUrl
      })
    )
  );

  return supabaseUrls;
}

export const runAiJob = inngest.createFunction(
  {
    id: "run-ai-job",
    retries: 0
  },
  { event: "ai/job.created" },
  async ({ event, step }) => {
    const { jobId } = event.data as { jobId: string };
    const job = await step.run("load job", async () => getDb().query.jobs.findFirst({ where: eq(jobs.id, jobId) }));
    if (!job) throw new Error(`Job ${jobId} not found`);
    if (job.status !== "pending") return { status: job.status };

    try {
      await step.run("mark processing", async () => markJobProcessing(job.id));
      if (job.type === "headshot") {
        const resultUrls = await step.run("generate and store headshots", async () => processHeadshotJob(job));
        await step.run("mark done", async () => markJobDone(job.id, resultUrls[0] ?? "", resultUrls));
        return { result: resultUrls };
      }

      const resultUrl = await step.run("generate and store result", async () => {
        const provider = getAiProvider(job.type as JobType);
        const result = await provider.generate(job.input as never);
        return storeAiResult({
          userId: job.userId,
          jobId: job.id,
          bytes: result.bytes,
          contentType: result.contentType,
          extension: result.extension
        });
      });
      await step.run("mark done", async () => markJobDone(job.id, resultUrl));
      await step.run("send ready email", async () => {
        const user = await getDb().query.users.findFirst({ where: eq(users.id, job.userId) });
        if (user?.email) await sendJobReadyEmail(user.email, `${getAppUrl()}/dashboard`);
      });
      return { resultUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown AI job failure";
      await step.run("refund credits", async () => refundJobCredits(job.id, message));
      throw error;
    } finally {
      await step.run("release concurrency slot", async () => releaseJobSlot(job.userId));
    }
  }
);
