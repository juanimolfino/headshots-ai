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
    return (
      Array.isArray(parsed) &&
      parsed.length >= 5 &&
      parsed.length <= 15 &&
      parsed.every((item) => typeof item === "string" && isUrl(item))
    );
  } catch {
    return false;
  }
}

const archiveUrlSchema = z.string().refine((value) => isUrl(value) || isUrlArrayJson(value), {
  message: "archive_url must be a URL or a JSON string array of 5 to 15 URLs"
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
    type: z.literal("headshot"),
    input: z.object({
      archive_url: archiveUrlSchema,
      style: z.enum(["Photographic", "Cinematic", "(No style)"]).default("Photographic"),
      num_images: z.number().min(1).max(8).default(4)
    })
  })
]);
