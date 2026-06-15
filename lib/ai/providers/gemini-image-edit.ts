import { fal } from "@fal-ai/client";
import { falPrivacyHeaders } from "@/lib/fal/privacy";
import { logInfo, logWarn } from "@/lib/observability/logger";
import { isLikelyExternalProviderIncident, reportError } from "@/lib/observability/report-error";
import type { HeadshotEditInput } from "@/lib/ai/types";

export const NANO_BANANA_PRO_MODEL = "gemini-3-pro-image";
export const FAL_NANO_BANANA_PRO_EDIT_ENDPOINT = "fal-ai/nano-banana-pro/edit";
export const GEMINI_IMAGE_API_VERSION = "v1";
const MAX_REFERENCE_IMAGES = 4;

const QUALITY_RESOLUTION = {
  low: "1K",
  medium: "2K",
  high: "4K",
  auto: "1K"
} as const;

const IMAGE_SIZE_ASPECT_RATIO = {
  auto: "auto",
  portrait_4_3: "3:4",
  landscape_16_9: "16:9"
} as const;

type FalImage = {
  url?: string;
};

type NanoBananaProEditOutput = {
  images?: FalImage[];
};

type GeminiPart = {
  text?: string;
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
};

async function imageUrlToInlineData(imageUrl: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Could not download reference image: ${response.status}`);

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const bytes = Buffer.from(await response.arrayBuffer());

  return {
    inlineData: {
      mimeType: contentType,
      data: bytes.toString("base64")
    }
  };
}

function getGeminiApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is required for Nano Banana Pro fallback");
  return key;
}

async function generateOneGeminiNanoBananaProImage(input: HeadshotEditInput) {
  const startedAt = Date.now();
  const aspectRatio = IMAGE_SIZE_ASPECT_RATIO[input.image_size ?? "auto"];
  const parts = [
    { text: `${input.prompt}\n\nCreate the final image in a ${aspectRatio} aspect ratio.` },
    ...(await Promise.all(input.image_urls.slice(0, MAX_REFERENCE_IMAGES).map(imageUrlToInlineData)))
  ];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/${GEMINI_IMAGE_API_VERSION}/models/${NANO_BANANA_PRO_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": getGeminiApiKey()
      },
      body: JSON.stringify({
        contents: [{ parts }]
      })
    }
  );

  const data = (await response.json()) as GeminiGenerateResponse & { error?: { message?: string } };
  if (!response.ok) {
    logWarn("provider_google_gemini_image_edit_failed_response", {
      area: "provider.google.gemini-image-edit",
      status: response.status,
      durationMs: Date.now() - startedAt
    });
    throw new Error(data.error?.message ?? `Gemini image edit fallback failed with status ${response.status}`);
  }

  const inlineImage = data.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data)?.inlineData;
  if (!inlineImage?.data) throw new Error("Gemini Nano Banana Pro fallback did not return an image");
  logInfo("provider_google_gemini_image_edit_completed", {
    area: "provider.google.gemini-image-edit",
    durationMs: Date.now() - startedAt
  });

  return `data:${inlineImage.mimeType ?? "image/png"};base64,${inlineImage.data}`;
}

async function generateGeminiNanoBananaProEditUrls(input: HeadshotEditInput) {
  const count = Math.max(1, Math.min(4, input.num_images ?? 1));
  const images: string[] = [];
  for (let i = 0; i < count; i++) {
    images.push(await generateOneGeminiNanoBananaProImage(input));
  }
  return images;
}

async function generateFalNanoBananaProEditUrls(input: HeadshotEditInput) {
  const startedAt = Date.now();
  const count = Math.max(1, Math.min(4, input.num_images ?? 1));
  const imageSize = input.image_size ?? "auto";
  fal.config({ credentials: process.env.FAL_KEY });

  let result;
  try {
    result = await fal.subscribe(FAL_NANO_BANANA_PRO_EDIT_ENDPOINT, {
      input: {
        prompt: input.prompt,
        image_urls: input.image_urls.slice(0, MAX_REFERENCE_IMAGES),
        num_images: count,
        aspect_ratio: IMAGE_SIZE_ASPECT_RATIO[imageSize],
        output_format: "png",
        resolution: QUALITY_RESOLUTION[input.quality ?? "low"]
      } as never,
      logs: true,
      headers: falPrivacyHeaders(),
      pollInterval: 5000,
      onEnqueue(requestId) {
        logInfo("provider_fal_nano_banana_pro_edit_enqueued", {
          area: "provider.fal.nano-banana-pro-edit",
          falRequestId: requestId
        });
      },
      onQueueUpdate(update) {
        logInfo("provider_fal_nano_banana_pro_edit_status", {
          area: "provider.fal.nano-banana-pro-edit",
          status: update.status
        });
        if ("logs" in update) {
          for (const log of update.logs) {
            logInfo("provider_fal_nano_banana_pro_edit_log", {
              area: "provider.fal.nano-banana-pro-edit",
              message: log.message
            });
          }
        }
      }
    });
  } catch (error) {
    if (isLikelyExternalProviderIncident(error)) {
      await reportError(error, {
        area: "provider.fal.nano-banana-pro-edit",
        severity: "warning",
        throttleKey: "provider:fal:nano-banana-pro-edit"
      });
    }
    throw error;
  }
  logInfo("provider_fal_nano_banana_pro_edit_completed", {
    area: "provider.fal.nano-banana-pro-edit",
    durationMs: Date.now() - startedAt
  });

  const imageUrls = (result.data as NanoBananaProEditOutput | undefined)?.images
    ?.map((image) => image.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
  if (!imageUrls?.length) {
    logWarn("provider_fal_nano_banana_pro_edit_empty_result", {
      area: "provider.fal.nano-banana-pro-edit",
      durationMs: Date.now() - startedAt
    });
    throw new Error("fal.ai Nano Banana Pro Edit did not return any image URLs");
  }

  return imageUrls;
}

export async function generateNanoBananaProEditUrls(input: HeadshotEditInput) {
  try {
    return await generateFalNanoBananaProEditUrls(input);
  } catch (error) {
    logWarn("provider_fal_nano_banana_pro_edit_fallback_to_gemini", {
      area: "provider.fal.nano-banana-pro-edit",
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error)
    });
    try {
      return await generateGeminiNanoBananaProEditUrls(input);
    } catch (fallbackError) {
      if (isLikelyExternalProviderIncident(fallbackError)) {
        await reportError(fallbackError, {
          area: "provider.google.gemini-image-edit",
          throttleKey: "provider:google:gemini-image-edit"
        });
      }
      throw fallbackError;
    }
  }
}
