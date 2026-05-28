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

  it("accepts headshot jobs with photomaker input defaults", () => {
    const result = createJobSchema.safeParse({
      type: "headshot",
      input: { archive_url: "https://storage.googleapis.com/fal/example.zip" }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.input.style).toBe("Photographic");
      expect(result.data.input.num_images).toBe(4);
    }
  });

  it("accepts headshot jobs with uploaded image URLs encoded as JSON", () => {
    const result = createJobSchema.safeParse({
      type: "headshot",
      input: {
        archive_url: JSON.stringify([
          "https://v3b.fal.media/files/example/photo-1.jpg",
          "https://v3b.fal.media/files/example/photo-2.jpg",
          "https://v3b.fal.media/files/example/photo-3.jpg",
          "https://v3b.fal.media/files/example/photo-4.jpg",
          "https://v3b.fal.media/files/example/photo-5.jpg"
        ]),
        style: "Cinematic",
        num_images: 2
      }
    });

    expect(result.success).toBe(true);
  });

  it("rejects headshot jobs with too many images", () => {
    const result = createJobSchema.safeParse({
      type: "headshot",
      input: { archive_url: "https://storage.googleapis.com/fal/example.zip", num_images: 9 }
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
