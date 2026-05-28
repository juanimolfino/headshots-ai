import { fal } from "@fal-ai/client";
import type { AiProvider, HeadshotInput } from "@/lib/ai/types";

const PHOTOMAKER_ENDPOINT = "fal-ai/photomaker";
const PHOTOMAKER_PROMPT = "professional corporate headshot, studio lighting, sharp focus, business attire, img";

type FalImage = {
  url?: string;
};

type PhotomakerOutput = {
  images?: FalImage[];
};

function toArrayBuffer(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).buffer;
}

export async function generatePhotomakerImageUrls(input: HeadshotInput): Promise<string[]> {
  fal.config({ credentials: process.env.FAL_KEY });

  const queued = await fal.queue.submit(PHOTOMAKER_ENDPOINT, {
    input: {
      image_archive_url: input.archive_url,
      prompt: PHOTOMAKER_PROMPT,
      style: input.style ?? "Photographic",
      num_images: input.num_images ?? 4
    }
  });

  await fal.queue.subscribeToStatus(PHOTOMAKER_ENDPOINT, {
    requestId: queued.request_id,
    logs: false
  });

  const result = await fal.queue.result(PHOTOMAKER_ENDPOINT, {
    requestId: queued.request_id
  });

  const imageUrls = (result.data as PhotomakerOutput | undefined)?.images
    ?.map((image) => image.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
  if (!imageUrls?.length) {
    throw new Error("fal.ai photomaker did not return any image URLs");
  }

  return imageUrls;
}

export const photomakerProvider: AiProvider<HeadshotInput> = {
  type: "headshot",
  costCredits: 1,
  async generate(input) {
    const imageUrls = await generatePhotomakerImageUrls(input);

    return {
      bytes: toArrayBuffer(imageUrls),
      contentType: "application/json",
      extension: "json"
    };
  }
};
