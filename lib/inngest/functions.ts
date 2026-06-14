import { getAiProvider } from "@/lib/ai/providers";
import { storeAiResult, storeLoraFileR2 } from "@/lib/ai/storage";
import { generateFluxLoraImageUrls } from "@/lib/ai/providers/flux-lora-generator";
import { generateNanoBananaProEditUrls } from "@/lib/ai/providers/gemini-image-edit";
import { generateGptImageEditUrls } from "@/lib/ai/providers/gpt-image-edit";
import {
  buildFluxLoraTrainerInput,
  FLUX_LORA_TRAINER_ENDPOINT,
  type FluxLoraTrainerOutput,
  getFluxLoraUrl,
  pollFluxLoraTrainer,
  submitFluxLoraTrainer
} from "@/lib/ai/providers/flux-lora-trainer";
import { getDb } from "@/lib/db";
import { jobs, users, type JobType } from "@/lib/db/schema";
import { markJobDone, markJobProcessing, reapStaleJobs, refundJobCredits, updateJobInput, updateJobMetadata } from "@/lib/db/queries";
import { sendJobFailedEmail, sendJobReadyEmail } from "@/lib/email/send";
import {
  deleteFalRequestPayloadsBestEffort,
  FAL_SOURCE_OBJECT_EXPIRATION_SECONDS,
  uploadFalStorageFile
} from "@/lib/fal/privacy";
import { getRefundCopy, getUserFacingJobError } from "@/lib/job-ux";
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
  background?: "white" | "gray" | "dark" | "outdoor";
  attire?: "suit" | "dress" | "business_casual" | "casual";
  attire_color?: string;
};

type HeadshotEditInput = {
  image_urls: string[];
  prompt: string;
  engine?: "gpt-image-2" | "gemini-3-pro-image";
  quality?: "low" | "medium" | "high" | "auto";
  num_images?: number;
};

type WorkerJob = {
  id: string;
  userId: string;
  type: JobType;
  input: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export const HEADSHOT_GENERATE_TIMEOUT_MS = 10 * 60 * 1000;
export const HEADSHOT_EDIT_TIMEOUT_MS = 10 * 60 * 1000;

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

function formatJobError(error: unknown) {
  const serialized = serializeError(error);
  const message = error instanceof Error ? error.message : "Unknown AI job failure";
  const details = JSON.stringify(serialized);
  return details.length > message.length ? `${message} | ${details}` : message;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 60000)} minutes`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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

function parseJsonObject(value: unknown, label: string, allowEmpty = false) {
  if (value === null || value === undefined) {
    if (allowEmpty) {
      console.log(`[parseJsonObject] ${label} is null/undefined → using {}`);
      return {} as Record<string, unknown>;
    }
    throw new Error(`${label} es null/undefined`);
  }
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} inválido (tipo: ${typeof parsed}): ${String(value)}`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`No se pudo parsear ${label}: ${error}`);
  }
}

function parseImageUrls(raw: unknown) {
  let urls: string[];
  try {
    urls = typeof raw === "string" ? JSON.parse(raw) : (raw as string[]);
    if (!Array.isArray(urls) || urls.length === 0 || urls.some((url) => typeof url !== "string" || url.length === 0)) {
      throw new Error(`archive_url inválido: ${String(raw)}`);
    }
  } catch (error) {
    throw new Error(`No se pudo parsear archive_url: ${error}`);
  }

  return urls;
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
  return uploadFalStorageFile({
    file: new File([archiveBytes], "headshot-sources.zip", { type: "application/zip" }),
    filename: "headshot-sources.zip",
    contentType: "application/zip",
    expirationSeconds: FAL_SOURCE_OBJECT_EXPIRATION_SECONDS
  });
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

  return input.path;
}

async function storeHeadshotImage(input: {
  userId: string;
  jobId: string;
  index: number;
  imageUrl: string;
}) {
  const downloaded = await downloadBytes(input.imageUrl, `generated headshot ${input.index + 1}`);
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "ai-results";
  const extension = downloaded.contentType.includes("png") ? "png" : "jpg";
  return storeSupabaseFile({
    bucket,
    path: `headshots/${input.userId}/${input.jobId}/${input.index}.${extension}`,
    bytes: downloaded.bytes,
    contentType: downloaded.contentType
  });
}

function getDashboardUrl() {
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "http://localhost:3000";
  const baseUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  return `${baseUrl.replace(/\/$/, "")}/dashboard/headshots`;
}

async function sendUserEmail(userId: string, subject: string, text: string, actionLabel = "Open dashboard") {
  const user = await getDb().query.users.findFirst({ where: eq(users.id, userId) });
  if (user?.email) {
    await sendJobReadyEmail(user.email, {
      subject,
      heading: subject,
      body: text,
      actionUrl: getDashboardUrl(),
      actionLabel
    });
  }
}

async function sendUserFailureEmail(job: { userId: string; creditsUsed: number; creditKind: "blue" | "gold" }, reason: string) {
  const user = await getDb().query.users.findFirst({ where: eq(users.id, job.userId) });
  const failure = getUserFacingJobError(reason);
  if (user?.email) {
    await sendJobFailedEmail(user.email, {
      subject: "No pudimos completar tu trabajo",
      heading: failure.title,
      body: failure.description,
      refund: getRefundCopy(job.creditsUsed, job.creditKind),
      actionUrl: getDashboardUrl(),
      actionLabel: "Reintentar"
    });
  }
}

type TrainingPrepResult = {
  triggerWord: string;
  trainerInput: ReturnType<typeof buildFluxLoraTrainerInput>;
};

async function prepareHeadshotTraining(job: WorkerJob): Promise<TrainingPrepResult> {
  const input = job.input as HeadshotTrainingInput;
  console.log("[headshot-training] prep: input", JSON.stringify({ archiveUrlType: typeof input.archive_url, steps: input.steps }));

  const triggerWord = createTriggerWord(job.userId);
  await updateJobMetadata(job.id, { ...(job.metadata ?? {}), trigger_word: triggerWord });
  console.log("[headshot-training] prep: triggerWord", triggerWord);

  const imageUrls = parseImageUrls(input.archive_url);
  console.log("[headshot-training] prep: parsed", imageUrls.length, "image URLs");

  const archiveUrl = await createAndUploadHeadshotArchive(imageUrls);

  const zipCheck = await checkPublicUrl(archiveUrl);
  if (!zipCheck.ok) throw new Error(`Training ZIP not publicly accessible: ${zipCheck.status}`);

  const trainerInput = buildFluxLoraTrainerInput({ images_data_url: archiveUrl, trigger_word: triggerWord, steps: input.steps });
  console.log("[headshot-training] prep: fal input built", JSON.stringify(sanitizeTrainerParams(trainerInput)));

  return { triggerWord, trainerInput };
}

async function cleanupTrainingSourceArtifacts(input: {
  jobId: string;
  jobInput: Record<string, unknown>;
  jobMetadata: Record<string, unknown>;
  falRequestId: string | null | undefined;
  imageCount: number;
}) {
  try {
    await deleteFalRequestPayloadsBestEffort(input.falRequestId, {
      jobId: input.jobId,
      reason: "training_complete_source_cleanup"
    });
  } catch (error) {
    console.warn("[headshot-training] fal cleanup failed:", error);
  }

  const cleanedAt = new Date().toISOString();
  const cleanedInput = {
    ...input.jobInput,
    archive_url: null,
    source_photos_deleted_at: cleanedAt,
    source_photo_count: input.imageCount
  };

  const cleanedMetadata = {
    ...input.jobMetadata,
    source_photos_cleanup: {
      cleanedAt,
      sourcePhotoCount: input.imageCount,
      falRequestPayloadsBestEffort: true,
      falSourceExpirationSeconds: FAL_SOURCE_OBJECT_EXPIRATION_SECONDS
    }
  };

  await updateJobInput(input.jobId, cleanedInput);
  await updateJobMetadata(input.jobId, cleanedMetadata);
  console.log("[headshot-training] source URLs redacted", { jobId: input.jobId, imageCount: input.imageCount });
}

async function storeTrainedLora(temporaryLoraUrl: string, userId: string, jobId: string): Promise<string> {
  try {
    const response = await fetch(temporaryLoraUrl, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const loraBytes = await response.arrayBuffer();
    const r2Key = await storeLoraFileR2({ userId, jobId, bytes: loraBytes });
    return r2Key;
  } catch (err) {
    console.warn("[headshot-training] R2 storage failed, using fal.storage URL:", err);
    return temporaryLoraUrl;
  }
}

async function processHeadshotGenerateJob(job: WorkerJob) {
  const input = job.input as HeadshotGenerateInput;
  const generatedUrls = await withTimeout(
    generateFluxLoraImageUrls(input),
    HEADSHOT_GENERATE_TIMEOUT_MS,
    "headshot-generate Fal call"
  );
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

async function processHeadshotEditJob(job: WorkerJob) {
  const input = job.input as HeadshotEditInput;
  const generatedUrls = await withTimeout(
    input.engine === "gemini-3-pro-image"
      ? generateNanoBananaProEditUrls(input)
      : generateGptImageEditUrls(input),
    HEADSHOT_EDIT_TIMEOUT_MS,
    "headshot-edit Fal call"
  );
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
      console.log(`[runAiJob] job.type: ${job.type}`);

      const workerJob: WorkerJob = {
        ...job,
        input: parseJsonObject(job.input, "job.input"),
        metadata: parseJsonObject(job.metadata, "job.metadata", true)
      };


      if (job.type === "headshot-training") {
        // Step 1: prepare archive and submit to fal.ai (fast, < 60s)
        const { triggerWord, trainerInput } = await step.run("prepare training", async () =>
          prepareHeadshotTraining(workerJob)
        );

        const falRequestId = await step.run("submit to fal trainer", async () => {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL;
          const webhookSecret = process.env.FAL_WEBHOOK_SECRET;
          const webhookUrl = appUrl
            ? webhookSecret
              ? `${appUrl}/api/webhooks/fal?secret=${encodeURIComponent(webhookSecret)}`
              : `${appUrl}/api/webhooks/fal`
            : undefined;
          try {
            return await submitFluxLoraTrainer(
              { images_data_url: trainerInput.images_data_url, trigger_word: triggerWord, steps: trainerInput.steps },
              webhookUrl
            );
          } catch (error) {
            logFalTrainerError(error, trainerInput);
            throw error;
          }
        });

        console.log("[headshot-training] fal request_id:", falRequestId, "— waiting for webhook");
        await step.run("store fal request id", async () =>
          updateJobMetadata(job.id, { ...workerJob.metadata, trigger_word: triggerWord, fal_request_id: falRequestId })
        );

        // Step 2: wait for fal.ai to call our webhook (no Vercel function held open)
        // Event name encodes the request_id — no CEL filter needed, match is exact by name.
        const falEvent = await step.waitForEvent("wait for fal training webhook", {
          event: `fal/training.${falRequestId}`,
          timeout: "45m"
        });

        if (!falEvent) throw new Error("Training timed out: fal.ai did not complete within 45 minutes");
        if (falEvent.data.status !== "OK") {
          throw new Error(`fal.ai training failed: ${JSON.stringify(falEvent.data.error)}`);
        }

        const temporaryLoraUrl = getFluxLoraUrl(falEvent.data.payload as FluxLoraTrainerOutput);

        // Step 4: store LoRA permanently (with Supabase fallback)
        const loraUrl = await step.run("store lora", async () =>
          storeTrainedLora(temporaryLoraUrl!, job.userId, job.id)
        );

        const result = { lora_url: loraUrl, trigger_word: triggerWord };
        await step.run("mark done", async () => markJobDone(job.id, loraUrl, result));
        await step.run("cleanup source photos", async () =>
          cleanupTrainingSourceArtifacts({
            jobId: job.id,
            jobInput: workerJob.input,
            jobMetadata: { ...workerJob.metadata, trigger_word: triggerWord, fal_request_id: falRequestId },
            falRequestId,
            imageCount: parseImageUrls(workerJob.input.archive_url).length
          })
        );
        await step.run("send ready email", async () =>
          sendUserEmail(
            job.userId,
            "Tu modelo personal está listo",
            "Tu modelo personal está listo. Entrá a tu dashboard para generar tus headshots.",
            "Ver modelo"
          )
        );
        return { result };
      }

      if (job.type === "headshot-generate") {
        const resultUrls = await step.run("generate and store headshots", async () => processHeadshotGenerateJob(workerJob));
        await step.run("mark done", async () => markJobDone(job.id, resultUrls[0] ?? "", resultUrls));
        await step.run("send ready email", async () =>
          sendUserEmail(
            job.userId,
            "Tus headshots están listos",
            "Tus headshots están listos. Entrá a tu dashboard para verlos y descargarlos.",
            "Ver resultados"
          )
        );
        return { result: resultUrls };
      }

      if (job.type === "headshot-edit") {
        const resultUrls = await step.run("edit and store headshots", async () => processHeadshotEditJob(workerJob));
        await step.run("mark done", async () => markJobDone(job.id, resultUrls[0] ?? "", resultUrls));
        await step.run("send ready email", async () =>
          sendUserEmail(
            job.userId,
            "Tus fotos están listas",
            "Tus fotos editadas están listas. Entrá a tu dashboard para verlas y descargarlas.",
            "Ver resultados"
          )
        );
        return { result: resultUrls };
      }

      const resultUrl = await step.run("generate and store result", async () => {
        const provider = getAiProvider(job.type as JobType);
        const result = await provider.generate(workerJob.input as never);
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
      const message = formatJobError(error);
      console.error("[runAiJob] failed:", message);
      const refunded = await step.run("refund credits", async () => refundJobCredits(job.id, message));
      if (refunded) {
        await step.run("send failure email", async () => sendUserFailureEmail(job, message));
      }
      throw error;
    } finally {
      await step.run("release concurrency slot", async () => releaseJobSlot(job.userId));
    }
  }
);

export const reapStaleAiJobs = inngest.createFunction(
  {
    id: "reap-stale-ai-jobs",
    retries: 0
  },
  { cron: "*/10 * * * *" },
  async ({ step }) => {
    return step.run("reap stale ai jobs", async () => reapStaleJobs());
  }
);
