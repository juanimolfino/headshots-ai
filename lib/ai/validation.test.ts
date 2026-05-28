import { describe, expect, it } from "vitest";
import { createJobSchema } from "@/lib/ai/validation";

describe("createJobSchema", () => {
  it("accepts image jobs with a prompt", () => {
    const result = createJobSchema.safeParse({
      type: "image",
      input: { prompt: "Generate a clean product mockup" }
    });

    expect(result.success).toBe(true);
  });

  it("accepts tts jobs with a supported voice", () => {
    const result = createJobSchema.safeParse({
      type: "tts",
      input: { text: "Welcome to the product.", voice: "nova" }
    });

    expect(result.success).toBe(true);
  });

  it("accepts headshot training jobs with defaults", () => {
    const result = createJobSchema.safeParse({
      type: "headshot-training",
      input: { archive_url: "https://storage.googleapis.com/fal/example.zip" }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.input.steps).toBe(1000);
    }
  });

  it("accepts headshot training jobs with uploaded image URLs encoded as JSON", () => {
    const result = createJobSchema.safeParse({
      type: "headshot-training",
      input: {
        archive_url: JSON.stringify([
          "https://v3b.fal.media/files/example/photo-1.jpg",
          "https://v3b.fal.media/files/example/photo-2.jpg",
          "https://v3b.fal.media/files/example/photo-3.jpg",
          "https://v3b.fal.media/files/example/photo-4.jpg",
          "https://v3b.fal.media/files/example/photo-5.jpg"
        ])
      }
    });

    expect(result.success).toBe(true);
  });

  it("accepts headshot training jobs with encoded image URLs and 300 steps", () => {
    const result = createJobSchema.safeParse({
      type: "headshot-training",
      input: {
        archive_url: JSON.stringify([
          "https://v3b.fal.media/files/example/photo-1.jpg",
          "https://v3b.fal.media/files/example/photo-2.jpg"
        ]),
        steps: 300
      }
    });

    expect(result.success).toBe(true);
  });

  it("accepts headshot generation jobs with defaults", () => {
    const result = createJobSchema.safeParse({
      type: "headshot-generate",
      input: {
        lora_url: "https://v3b.fal.media/files/example/model.safetensors",
        trigger_word: "ohwx1234"
      }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.input.style).toBe("professional");
      expect(result.data.input.num_images).toBe(4);
    }
  });

  it("rejects headshot generation jobs with too many images", () => {
    const result = createJobSchema.safeParse({
      type: "headshot-generate",
      input: {
        lora_url: "https://v3b.fal.media/files/example/model.safetensors",
        trigger_word: "ohwx1234",
        num_images: 9
      }
    });

    expect(result.success).toBe(false);
  });

  it("rejects unsupported job types", () => {
    const result = createJobSchema.safeParse({
      type: "video",
      input: { prompt: "Generate a video" }
    });

    expect(result.success).toBe(false);
  });

  it("rejects too-short prompts", () => {
    const result = createJobSchema.safeParse({
      type: "image",
      input: { prompt: "hi" }
    });

    expect(result.success).toBe(false);
  });
});
