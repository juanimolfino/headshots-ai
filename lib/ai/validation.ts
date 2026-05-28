import { z } from "zod";

function isUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isUrlArrayJson(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length >= 5 && parsed.every((item) => typeof item === "string" && isUrl(item));
  } catch {
    return false;
  }
}

const trainingArchiveUrlSchema = z.string().refine((value) => isUrl(value) || isUrlArrayJson(value), {
  message: "archive_url must be a URL or a JSON string array of image URLs"
});

export const createJobSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("image"),
    input: z.object({
      prompt: z.string().min(3).max(1200)
    })
  }),
  z.object({
    type: z.literal("tts"),
    input: z.object({
      text: z.string().min(3).max(5000),
      voice: z.enum(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]).optional()
    })
  }),
  z.object({
    type: z.literal("headshot-training"),
    input: z.object({
      archive_url: trainingArchiveUrlSchema,
      steps: z.number().min(500).max(2000).default(1000)
    })
  }),
  z.object({
    type: z.literal("headshot-generate"),
    input: z.object({
      lora_url: z.string().url(),
      trigger_word: z.string(),
      style: z.enum(["professional", "cinematic", "natural"]).default("professional"),
      num_images: z.number().min(2).max(8).default(4)
    })
  })
]);
