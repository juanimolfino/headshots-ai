import { fal } from "@fal-ai/client";
import { getAiProvider } from "@/lib/ai/providers";
import { storeAiResult } from "@/lib/ai/storage";
import { generateFluxLoraImageUrls } from "@/lib/ai/providers/flux-lora-generator";
import {
  buildFluxLoraTrainerInput,
  FLUX_LORA_TRAINER_ENDPOINT,
  trainFluxLora
} from "@/lib/ai/providers/flux-lora-trainer";
import { getDb } from "@/lib/db";
import { jobs, users, type JobType } from "@/lib/db/schema";
import { markJobDone, markJobProcessing, refundJobCredits, updateJobMetadata } from "@/lib/db/queries";
import { sendPlainEmail } from "@/lib/email/send";
import { releaseJobSlot } from "@/lib/redis/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { inngest } from "./client";
import { eq } from "drizzle-orm";
import JSZip from "jszip";

type HeadshotTrainingInput = {
  archive_url: string;
  steps?: number;
};

type HeadshotGenerateInput = {
  lora_url: string;
  trigger_word: string;
  style?: "professional" | "cinematic" | "natural";
  num_images?: number;
};

type WorkerJob = {
  id: string;
  userId: string;
  type: JobType;
  input: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

function createTriggerWord(userId: string) {
  void userId;
  const randomLetters = Math.random()
    .toString(36)
    .replace(/[^a-z]/g, "")
    .substring(0, 4)
    .padEnd(4, "x");
  return `ohwx${randomLetters}`;
}

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return { message: String(error) };

  const details: Record<string, unknown> = {
    name: error.name,
    message: error.message
  };

  for (const key of Object.getOwnPropertyNames(error)) {
    if (key === "name" || key === "message" || key === "stack") continue;
    details[key] = (error as unknown as Record<string, unknown>)[key];
  }

  return details;
}

function redactUrl(value: string) {
  try {
    const url = new URL(value);
    url.search = "";
    return url.toString();
  } catch {
    return value;
  }
}

function sanitizeTrainerParams(params: ReturnType<typeof buildFluxLoraTrainerInput>) {
  return {
    ...params,
    images_data_url: redactUrl(params.images_data_url)
  };
}

function logFalTrainerError(error: unknown, params: ReturnType<typeof buildFluxLoraTrainerInput>) {
  const falError = error as { message?: unknown; body?: unknown; status?: unknown };
  console.log("[headshot-training] fal error:", falError.message, falError.body, falError.status);
  console.error("fal.ai Flux LoRA trainer failed", {
    endpoint: FLUX_LORA_TRAINER_ENDPOINT,
    params: sanitizeTrainerParams(params),
    error: serializeError(error)
  });
}

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

async function checkPublicUrl(url: string) {
  const response = await fetch(url, { method: "HEAD" });
  console.log("[headshot-training] ZIP accessible:", response.ok, response.status);
  return response;
}

async function storeSupabaseFile(input: {
  bucket: string;
  path: string;
  bytes: ArrayBuffer;
  contentType: string;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(input.bucket).upload(input.path, input.bytes, {
    upsert: true,
    contentType: input.contentType
  });
  if (error) throw error;

  return supabase.storage.from(input.bucket).getPublicUrl(input.path).data.publicUrl;
}

async function storeLoraFile(input: { userId: string; jobId: string; loraUrl: string }) {
  const downloaded = await downloadBytes(input.loraUrl, "trained LoRA file");
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "ai-results";
  return storeSupabaseFile({
    bucket,
    path: `loras/${input.userId}/${input.jobId}/model.safetensors`,
    bytes: downloaded.bytes,
    contentType: downloaded.contentType
  });
}

async function storeHeadshotImage(input: {
  userId: string;
  jobId: string;
  index: number;
  imageUrl: string;
}) {
  const downloaded = await downloadBytes(input.imageUrl, `generated headshot ${input.index + 1}`);
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "ai-results";
  return storeSupabaseFile({
    bucket,
    path: `headshots/${input.userId}/${input.jobId}/${input.index}.jpg`,
    bytes: downloaded.bytes,
    contentType: downloaded.contentType
  });
}

async function sendUserEmail(userId: string, subject: string, text: string) {
  const user = await getDb().query.users.findFirst({ where: eq(users.id, userId) });
  if (user?.email) await sendPlainEmail({ to: user.email, subject, text });
}

async function processHeadshotTrainingJob(job: WorkerJob) {
  const input = job.input as HeadshotTrainingInput;
  const triggerWord = createTriggerWord(job.userId);
  await updateJobMetadata(job.id, { ...(job.metadata ?? {}), trigger_word: triggerWord });

  const imageUrls = parseImageUrls(input.archive_url);
  console.log("[headshot-training] parsed image URLs:", JSON.stringify(imageUrls));
  const archiveUrl = imageUrls ? await createAndUploadHeadshotArchive(imageUrls) : input.archive_url;
  console.log("[headshot-training] ZIP URL:", archiveUrl);
  const zipCheck = await checkPublicUrl(archiveUrl);
  if (!zipCheck.ok) {
    throw new Error(`Headshot training ZIP is not publicly accessible: ${zipCheck.status}`);
  }
  const trainerInput = {
    images_data_url: archiveUrl,
    trigger_word: triggerWord,
    steps: input.steps
  };
  const falInput = buildFluxLoraTrainerInput(trainerInput);
  console.log("[headshot-training] fal input:", JSON.stringify(falInput));
  let temporaryLoraUrl: string;
  try {
    temporaryLoraUrl = await trainFluxLora(trainerInput);
  } catch (error) {
    logFalTrainerError(error, falInput);
    throw error;
  }
  const loraUrl = await storeLoraFile({
    userId: job.userId,
    jobId: job.id,
    loraUrl: temporaryLoraUrl
  });

  return {
    lora_url: loraUrl,
    trigger_word: triggerWord
  };
}

async function processHeadshotGenerateJob(job: WorkerJob) {
  const input = job.input as HeadshotGenerateInput;
  const generatedUrls = await generateFluxLoraImageUrls(input);
  return Promise.all(
    generatedUrls.map((imageUrl, index) =>
      storeHeadshotImage({
        userId: job.userId,
        jobId: job.id,
        index,
        imageUrl
      })
    )
  );
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

      if (job.type === "headshot-training") {
        const result = await step.run("train and store headshot lora", async () => processHeadshotTrainingJob(job));
        await step.run("mark done", async () => markJobDone(job.id, result.lora_url, result));
        await step.run("send ready email", async () =>
          sendUserEmail(
            job.userId,
            "Tu modelo personal está listo",
            "Tu modelo personal está listo. Entrá a tu dashboard para generar tus headshots."
          )
        );
        return { result };
      }

      if (job.type === "headshot-generate") {
        const resultUrls = await step.run("generate and store headshots", async () => processHeadshotGenerateJob(job));
        await step.run("mark done", async () => markJobDone(job.id, resultUrls[0] ?? "", resultUrls));
        await step.run("send ready email", async () =>
          sendUserEmail(
            job.userId,
            "Tus headshots están listos",
            "Tus headshots están listos. Entrá a tu dashboard para verlos y descargarlos."
          )
        );
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
      await step.run("send ready email", async () =>
        sendUserEmail(job.userId, "Your AI job is ready", "Your AI job is ready. Open your dashboard to view it.")
      );
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
