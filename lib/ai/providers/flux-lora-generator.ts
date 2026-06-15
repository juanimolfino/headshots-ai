import { fal } from "@fal-ai/client";
import { createLoraSignedUrl, createLoraSignedUrlR2, isR2LoraKey, isSupabaseLoraPath } from "@/lib/ai/storage";
import { falPrivacyHeaders } from "@/lib/fal/privacy";
import { isLikelyExternalProviderIncident, reportError } from "@/lib/observability/report-error";
import type { AiProvider, HeadshotGenerateInput } from "@/lib/ai/types";

const FLUX_LORA_GENERATOR_ENDPOINT = "fal-ai/flux-lora";

type FalImage = {
  url?: string;
};

type FluxLoraGeneratorOutput = {
  images?: FalImage[];
};

// Base prompts — no background included here; injected separately so user overrides work cleanly
const prompts: Record<NonNullable<HeadshotGenerateInput["style"]>, string> = {
  professional: "{trigger_word}, professional headshot, business attire, studio lighting, sharp focus, photorealistic, 50mm lens",
  cinematic:    "{trigger_word}, cinematic portrait, editorial photography, moody directional lighting, shallow depth of field, sharp focus on face, photorealistic, 85mm lens",
  natural:      "{trigger_word}, natural portrait, soft window light, relaxed expression, sharp focus, photorealistic, 50mm lens"
};

const defaultBackgrounds: Record<NonNullable<HeadshotGenerateInput["style"]>, string> = {
  professional: "neutral gray background",
  cinematic:    "dark gradient background",
  natural:      "outdoor blurred background"
};

const backgroundTokens: Record<NonNullable<HeadshotGenerateInput["background"]>, string> = {
  white:   "white studio background",
  gray:    "neutral gray background",
  dark:    "dark gradient background",
  outdoor: "outdoor blurred background"
};

const attireTokens: Record<NonNullable<HeadshotGenerateInput["attire"]>, string> = {
  suit:             "suit",
  dress:            "dress",
  business_casual:  "business casual outfit",
  casual:           "casual outfit"
};

function toArrayBuffer(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).buffer;
}

function buildPrompt(input: HeadshotGenerateInput): string {
  const style = input.style ?? "professional";
  const base = prompts[style].replace("{trigger_word}", input.trigger_word);

  const extras: string[] = [];

  // Background: user selection overrides style default
  extras.push(
    input.background ? backgroundTokens[input.background] : defaultBackgrounds[style]
  );

  // Attire (optional)
  if (input.attire) {
    const attireDesc = input.attire_color
      ? `${input.attire_color} ${attireTokens[input.attire]}`
      : attireTokens[input.attire];
    extras.push(`wearing a ${attireDesc}`);
  }

  return `${base}, ${extras.join(", ")}`;
}

export async function generateFluxLoraImageUrls(input: HeadshotGenerateInput): Promise<string[]> {
  fal.config({ credentials: process.env.FAL_KEY });

  const loraUrl = isR2LoraKey(input.lora_url)
    ? await createLoraSignedUrlR2(input.lora_url)
    : isSupabaseLoraPath(input.lora_url)
      ? await createLoraSignedUrl(input.lora_url)
      : input.lora_url;

  let result;
  try {
    result = await fal.subscribe(FLUX_LORA_GENERATOR_ENDPOINT, {
      input: {
        prompt: buildPrompt(input),
        image_size: "portrait_4_3",
        guidance_scale: 3.5,
        num_inference_steps: 35,
        num_images: input.num_images ?? 4,
        loras: [{ path: loraUrl, scale: 1.0 }]
      } as never,
      logs: true,
      headers: falPrivacyHeaders(),
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
  } catch (error) {
    if (isLikelyExternalProviderIncident(error)) {
      await reportError(error, {
        area: "provider.fal.flux-lora-generator",
        throttleKey: "provider:fal:flux-lora-generator"
      });
    }
    throw error;
  }

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
  costCredits: 4,
  creditKind: "blue",
  calculateCredits: (input) => input.num_images ?? 4,
  async generate(input) {
    const imageUrls = await generateFluxLoraImageUrls(input);

    return {
      bytes: toArrayBuffer(imageUrls),
      contentType: "application/json",
      extension: "json"
    };
  }
};
