import { fal } from "@fal-ai/client";
import type { AiProvider, HeadshotTrainingInput } from "@/lib/ai/types";

export const FLUX_LORA_TRAINER_ENDPOINT = "fal-ai/flux-lora-portrait-trainer";

export type FluxLoraTrainerOutput = {
  config_file?: {
    url?: string | null;
    file_name?: string | null;
    file_size?: number | null;
    content_type?: string | null;
  } | null;
  diffusers_lora_file?: {
    url?: string | null;
    file_name?: string | null;
    file_size?: number | null;
    content_type?: string | null;
  } | null;
};

function toArrayBuffer(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).buffer;
}

export function buildFluxLoraTrainerInput(input: HeadshotTrainingInput) {
  return {
    images_data_url: input.images_data_url,
    trigger_phrase: input.trigger_word,
    steps: input.steps ?? 1000,
    learning_rate: 0.0002,
    multiresolution_training: true,
    subject_crop: true,
    create_masks: false
  };
}

export function getFluxLoraUrl(resultData: FluxLoraTrainerOutput | undefined) {
  const loraUrl = resultData?.diffusers_lora_file?.url;
  if (!loraUrl) {
    throw new Error(`fal.ai no devolvió URL del LoRA. Output: ${JSON.stringify(resultData)}`);
  }

  return loraUrl;
}

export async function submitFluxLoraTrainer(input: HeadshotTrainingInput, webhookUrl?: string): Promise<string> {
  fal.config({ credentials: process.env.FAL_KEY });
  const trainerInput = buildFluxLoraTrainerInput(input);
  const { request_id } = await fal.queue.submit(FLUX_LORA_TRAINER_ENDPOINT, {
    input: trainerInput as never,
    ...(webhookUrl ? { webhookUrl } : {})
  });
  console.log("[flux-lora-trainer] submitted, request_id:", request_id, "webhook:", webhookUrl ?? "none");
  return request_id;
}

export async function pollFluxLoraTrainer(requestId: string): Promise<{ done: boolean; result?: FluxLoraTrainerOutput }> {
  fal.config({ credentials: process.env.FAL_KEY });
  const status = await fal.queue.status(FLUX_LORA_TRAINER_ENDPOINT, { requestId, logs: true });
  console.log("[flux-lora-trainer] poll status:", status.status);

  if (status.status === "COMPLETED") {
    const resultResponse = await fal.queue.result(FLUX_LORA_TRAINER_ENDPOINT, { requestId });
    return { done: true, result: resultResponse.data as FluxLoraTrainerOutput };
  }

  const statusStr = String(status.status);
  if (statusStr === "FAILED" || statusStr === "CANCELLED") {
    throw new Error(`fal.ai training failed for request ${requestId}: ${statusStr}`);
  }

  return { done: false };
}

export async function trainFluxLora(input: HeadshotTrainingInput): Promise<string> {
  const requestId = await submitFluxLoraTrainer(input);
  const poll = await pollFluxLoraTrainer(requestId);
  const loraUrl = getFluxLoraUrl(poll.result);
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
