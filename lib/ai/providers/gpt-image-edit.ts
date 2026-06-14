import { fal } from "@fal-ai/client";
import { falPrivacyHeaders } from "@/lib/fal/privacy";
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
  fal.config({ credentials: process.env.FAL_KEY });

  const result = await fal.subscribe(GPT_IMAGE_EDIT_ENDPOINT, {
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
      console.log("[gpt-image-edit] enqueued:", requestId);
    },
    onQueueUpdate(update) {
      console.log("[gpt-image-edit] status:", update.status);
      if ("logs" in update) {
        for (const log of update.logs) console.log("[gpt-image-edit]", log.message);
      }
    }
  });

  const imageUrls = (result.data as GptImageEditOutput | undefined)?.images
    ?.map((image) => image.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
  if (!imageUrls?.length) {
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
