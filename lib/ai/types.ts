import type { JobType } from "@/lib/db/schema";

export type ImageInput = {
  prompt: string;
};

export type TtsInput = {
  text: string;
  voice?: "alloy" | "ash" | "ballad" | "coral" | "echo" | "fable" | "nova" | "onyx" | "sage" | "shimmer";
};

export type HeadshotTrainingInput = {
  images_data_url: string;
  trigger_word: string;
  steps?: number;
};

export type HeadshotGenerateInput = {
  lora_url: string;
  trigger_word: string;
  style?: "professional" | "cinematic" | "natural";
  num_images?: number;
  background?: "white" | "gray" | "dark" | "outdoor";
  attire?: "suit" | "dress" | "business_casual" | "casual";
  attire_color?: string;
};

export type AiInput = ImageInput | TtsInput | HeadshotTrainingInput | HeadshotGenerateInput;

export type AiResult = {
  bytes: ArrayBuffer;
  contentType: string;
  extension: "png" | "mp3" | "json";
};

export type AiProvider<TInput extends AiInput = AiInput> = {
  type: JobType;
  costCredits: number;
  generate(input: TInput): Promise<AiResult>;
};
