import { z } from "zod";

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
      archive_url: z.string(),
      steps: z.number().min(300).max(2000).default(1000)
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
