import { z } from "zod";

function parseArchiveUrlList(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

const headshotArchiveSchema = z.string().superRefine((value, context) => {
  if (!value.trim().startsWith("[")) return;

  const urls = parseArchiveUrlList(value);
  if (!urls) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "archive_url JSON must be an array of image URLs" });
    return;
  }

  if (urls.length < 10) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "headshot-training requires at least 10 image URLs" });
  }

  if (urls.some((url) => typeof url !== "string" || !url.startsWith("https://"))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "archive_url must contain only HTTPS image URLs" });
  }
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
      archive_url: headshotArchiveSchema,
      steps: z.number().min(1000).max(2500).default(1000)
    })
  }),
  z.object({
    type: z.literal("headshot-generate"),
    input: z.object({
      lora_url: z.string().url(),
      trigger_word: z.string(),
      style: z.enum(["professional", "cinematic", "natural"]).default("professional"),
      num_images: z.number().min(1).max(4).default(4)
    })
  })
]);
