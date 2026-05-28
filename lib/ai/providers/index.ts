import type { AiInput, AiProvider } from "@/lib/ai/types";
import type { JobType } from "@/lib/db/schema";
import { falImageProvider } from "./fal";
import { openAiTtsProvider } from "./openai-tts";
import { photomakerProvider } from "./photomaker";

const providers = {
  image: falImageProvider,
  tts: openAiTtsProvider,
  headshot: photomakerProvider
} satisfies Record<JobType, AiProvider>;

export function getAiProvider(type: JobType): AiProvider<AiInput> {
  return providers[type] as AiProvider<AiInput>;
}
