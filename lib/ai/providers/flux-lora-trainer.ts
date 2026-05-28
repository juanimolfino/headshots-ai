import { fal } from "@fal-ai/client";
import type { AiProvider, HeadshotTrainingInput } from "@/lib/ai/types";

const FLUX_LORA_TRAINER_ENDPOINT = "fal-ai/flux-lora-portrait-trainer";

type FluxLoraTrainerOutput = {
  diffusers_lora_file?: {
    url?: string;
  };
};

function toArrayBuffer(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).buffer;
}

export async function trainFluxLora(input: HeadshotTrainingInput): Promise<string> {
  fal.config({ credentials: process.env.FAL_KEY });

  const queued = await fal.queue.submit(FLUX_LORA_TRAINER_ENDPOINT, {
    input: {
      images_data_url: input.images_data_url,
      trigger_word: input.trigger_word,
      steps: input.steps ?? 1000,
      learning_rate: 0.0002,
      multiresolution_training: true,
      subject_crop: true,
      create_masks: false
    } as never
  });

  const result = await fal.queue.result(FLUX_LORA_TRAINER_ENDPOINT, {
    requestId: queued.request_id
  });

  const loraUrl = (result.data as FluxLoraTrainerOutput | undefined)?.diffusers_lora_file?.url;
  if (!loraUrl) {
    throw new Error("fal.ai Flux LoRA trainer did not return a LoRA file URL");
  }

  return loraUrl;
}

export const fluxLoraTrainerProvider: AiProvider<HeadshotTrainingInput> = {
  type: "headshot-training",
  costCredits: 1,
  async generate(input) {
    const loraUrl = await trainFluxLora(input);

    return {
      bytes: toArrayBuffer({ lora_url: loraUrl }),
      contentType: "application/json",
      extension: "json"
    };
  }
};
