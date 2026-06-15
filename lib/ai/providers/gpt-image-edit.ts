import { fal } from "@fal-ai/client";
import { falPrivacyHeaders } from "@/lib/fal/privacy";
import { logInfo, logWarn } from "@/lib/observability/logger";
import { isLikelyExternalProviderIncident, reportError } from "@/lib/observability/report-error";
import type { AiProvider, HeadshotEditInput } from "@/lib/ai/types";

const GPT_IMAGE_EDIT_ENDPOINT = "openai/gpt-image-2/edit";
const MAX_REFERENCE_IMAGES = 4;

const QUALITY_BLUE_COST = {
  low: 1,
  medium: 2,
  high: 3,
  auto: 2
} as const;

type FalImage = {
  url?: string;
};

type GptImageEditOutput = {
  images?: FalImage[];
};

function toArrayBuffer(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).buffer;
}

export async function generateGptImageEditUrls(input: HeadshotEditInput): Promise<string[]> {
  const startedAt = Date.now();
  fal.config({ credentials: process.env.FAL_KEY });

  let result;
  try {
    result = await fal.subscribe(GPT_IMAGE_EDIT_ENDPOINT, {
      input: {
        prompt: input.prompt,
        image_urls: input.image_urls.slice(0, MAX_REFERENCE_IMAGES),
        image_size: input.image_size ?? "auto",
        quality: input.quality ?? "low",
        num_images: input.num_images ?? 1,
        output_format: "png"
      } as never,
      logs: true,
      headers: falPrivacyHeaders(),
      pollInterval: 5000,
      onEnqueue(requestId) {
        logInfo("provider_fal_gpt_image_edit_enqueued", {
          area: "provider.fal.gpt-image-edit",
          falRequestId: requestId
        });
      },
      onQueueUpdate(update) {
        logInfo("provider_fal_gpt_image_edit_status", {
          area: "provider.fal.gpt-image-edit",
          status: update.status
        });
        if ("logs" in update) {
          for (const log of update.logs) {
            logInfo("provider_fal_gpt_image_edit_log", {
              area: "provider.fal.gpt-image-edit",
              message: log.message
            });
          }
        }
      }
    });
  } catch (error) {
    if (isLikelyExternalProviderIncident(error)) {
      await reportError(error, {
        area: "provider.fal.gpt-image-edit",
        throttleKey: "provider:fal:gpt-image-edit"
      });
    }
    throw error;
  }
  logInfo("provider_fal_gpt_image_edit_completed", {
    area: "provider.fal.gpt-image-edit",
    durationMs: Date.now() - startedAt
  });

  const imageUrls = (result.data as GptImageEditOutput | undefined)?.images
    ?.map((image) => image.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
  if (!imageUrls?.length) {
    logWarn("provider_fal_gpt_image_edit_empty_result", {
      area: "provider.fal.gpt-image-edit",
      durationMs: Date.now() - startedAt
    });
    throw new Error("fal.ai GPT Image 2 Edit did not return any image URLs");
  }

  return imageUrls;
}

export const gptImageEditProvider: AiProvider<HeadshotEditInput> = {
  type: "headshot-edit",
  costCredits: 1,
  creditKind: "blue",
  calculateCredits: (input) => (input.num_images ?? 1) * QUALITY_BLUE_COST[input.quality ?? "low"],
  async generate(input) {
    const imageUrls = await generateGptImageEditUrls(input);

    return {
      bytes: toArrayBuffer(imageUrls),
      contentType: "application/json",
      extension: "json"
    };
  }
};
