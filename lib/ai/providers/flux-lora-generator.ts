import { fal } from "@fal-ai/client";
import { createLoraSignedUrl, createLoraSignedUrlR2, isR2LoraKey, isSupabaseLoraPath } from "@/lib/ai/storage";
import type { AiProvider, HeadshotGenerateInput } from "@/lib/ai/types";

const FLUX_LORA_GENERATOR_ENDPOINT = "fal-ai/flux-lora";

type FalImage = {
  url?: string;
};

type FluxLoraGeneratorOutput = {
  images?: FalImage[];
};

const prompts = {
  professional: "{trigger_word}, professional headshot, business attire, studio lighting, neutral gray background, sharp focus, photorealistic, 50mm lens",
  cinematic: "{trigger_word}, cinematic headshot, editorial style, dramatic lighting, high contrast, sharp focus, photorealistic",
  natural: "{trigger_word}, natural portrait, soft natural lighting, candid professional look, sharp focus, photorealistic"
} satisfies Record<NonNullable<HeadshotGenerateInput["style"]>, string>;

function toArrayBuffer(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).buffer;
}

function buildPrompt(input: HeadshotGenerateInput) {
  const style = input.style ?? "professional";
  const base = prompts[style].replace("{trigger_word}", input.trigger_word);
  if (input.custom_prompt?.trim()) {
    return base.replace(`${input.trigger_word},`, `${input.trigger_word}, ${input.custom_prompt.trim()},`);
  }
  return base;
}

export async function generateFluxLoraImageUrls(input: HeadshotGenerateInput): Promise<string[]> {
  fal.config({ credentials: process.env.FAL_KEY });

  const loraUrl = isR2LoraKey(input.lora_url)
    ? await createLoraSignedUrlR2(input.lora_url)
    : isSupabaseLoraPath(input.lora_url)
      ? await createLoraSignedUrl(input.lora_url)
      : input.lora_url;

  const result = await fal.subscribe(FLUX_LORA_GENERATOR_ENDPOINT, {
    input: {
      prompt: buildPrompt(input),
      image_size: "portrait_4_3",
      guidance_scale: 3.5,
      num_inference_steps: 28,
      num_images: input.num_images ?? 4,
      loras: [{ path: loraUrl, scale: 1 }]
    } as never,
    logs: true,
    pollInterval: 5000,
    onEnqueue(requestId) {
      console.log("[flux-lora-generator] enqueued:", requestId);
    },
    onQueueUpdate(update) {
      console.log("[flux-lora-generator] status:", update.status);
      if ("logs" in update) {
        for (const log of update.logs) console.log("[flux-lora-generator]", log.message);
      }
    }
  });

  const imageUrls = (result.data as FluxLoraGeneratorOutput | undefined)?.images
    ?.map((image) => image.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
  if (!imageUrls?.length) {
    throw new Error("fal.ai Flux LoRA generator did not return any image URLs");
  }

  return imageUrls;
}

export const fluxLoraGeneratorProvider: AiProvider<HeadshotGenerateInput> = {
  type: "headshot-generate",
  costCredits: 1,
  async generate(input) {
    const imageUrls = await generateFluxLoraImageUrls(input);

    return {
      bytes: toArrayBuffer(imageUrls),
      contentType: "application/json",
      extension: "json"
    };
  }
};
