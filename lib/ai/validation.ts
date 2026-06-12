import { z } from "zod";

// Only allow fal.storage HTTPS URLs as training photo sources
const falStorageUrl = z
  .string()
  .url()
  .refine(url => url.startsWith("https://"), "Training photo URLs must be HTTPS");

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

  if (urls.length < 10 || urls.length > 20) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "headshot-training requires between 10 and 20 image URLs" });
  }

  for (const url of urls) {
    const result = falStorageUrl.safeParse(url);
    if (!result.success) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "archive_url must contain only valid HTTPS image URLs" });
      return;
    }
  }
});

// lora_url must be an R2 key, a legacy Supabase path, or an HTTPS URL — never arbitrary
const loraUrlSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    url => url.startsWith("r2:loras/") || url.startsWith("loras/") || url.startsWith("https://"),
    "Invalid lora_url format"
  );

// trigger_word is always "ohwx" + 4 lowercase letters from the trainer
const triggerWordSchema = z
  .string()
  .regex(/^[a-z0-9]{4,20}$/, "trigger_word must be 4–20 lowercase alphanumeric characters");

const referenceImageUrlSchema = z
  .string()
  .url()
  .refine(url => url.startsWith("https://"), "Reference image URLs must be HTTPS");

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
      voice: z
        .enum(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"])
        .optional()
    })
  }),
  z.object({
    type: z.literal("headshot-training"),
    input: z.object({
      archive_url: headshotArchiveSchema,
      steps: z.number().int().min(500).max(2000).default(1000),
      name: z.string().min(1).max(60).trim().optional()
    })
  }),
  z.object({
    type: z.literal("headshot-generate"),
    input: z.object({
      lora_url: loraUrlSchema,
      trigger_word: triggerWordSchema,
      style: z.enum(["professional", "cinematic", "natural"]).default("professional"),
      num_images: z.number().int().min(1).max(4).default(4),
      // Strict enum for background — no free-text injection
      background: z.enum(["white", "gray", "dark", "outdoor"]).optional(),
      // Strict enum for attire type
      attire: z.enum(["suit", "dress", "business_casual", "casual"]).optional(),
      // Strict enum for attire color — controls what goes into the prompt
      attire_color: z
        .enum(["black", "white", "navy blue", "gray", "red", "emerald green", "beige"])
        .optional()
    })
  }),
  z.object({
    type: z.literal("headshot-edit"),
    input: z.object({
      image_urls: z.array(referenceImageUrlSchema).min(1).max(4),
      prompt: z.string().min(10).max(2000),
      engine: z.literal("gpt-image-2").default("gpt-image-2"),
      quality: z.enum(["low", "medium", "high"]).default("low"),
      num_images: z.number().int().min(1).max(4).default(1)
    })
  })
]);
