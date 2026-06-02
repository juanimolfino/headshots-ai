import type { AiInput, AiProvider } from "@/lib/ai/types";
import type { JobType } from "@/lib/db/schema";
import { falImageProvider } from "./fal";
import { fluxLoraGeneratorProvider } from "./flux-lora-generator";
import { fluxLoraTrainerProvider } from "./flux-lora-trainer";
import { gptImageEditProvider } from "./gpt-image-edit";
import { openAiTtsProvider } from "./openai-tts";

const providers = {
  image: falImageProvider,
  tts: openAiTtsProvider,
  "headshot-training": fluxLoraTrainerProvider,
  "headshot-generate": fluxLoraGeneratorProvider,
  "headshot-edit": gptImageEditProvider
} satisfies Record<JobType, AiProvider>;

export function getAiProvider(type: JobType): AiProvider<AiInput> {
  return providers[type] as AiProvider<AiInput>;
}
