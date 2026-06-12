import { describe, expect, it } from "vitest";
import { createJobSchema } from "@/lib/ai/validation";
import { gptImageEditProvider } from "@/lib/ai/providers/gpt-image-edit";

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
      expect(result.data.type).toBe("headshot-training");
      if (result.data.type !== "headshot-training") throw new Error("Expected headshot-training job");
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
          "https://v3b.fal.media/files/example/photo-5.jpg",
          "https://v3b.fal.media/files/example/photo-6.jpg",
          "https://v3b.fal.media/files/example/photo-7.jpg",
          "https://v3b.fal.media/files/example/photo-8.jpg",
          "https://v3b.fal.media/files/example/photo-9.jpg",
          "https://v3b.fal.media/files/example/photo-10.jpg"
        ])
      }
    });

    expect(result.success).toBe(true);
  });

  it("rejects headshot training jobs with too few encoded image URLs", () => {
    const result = createJobSchema.safeParse({
      type: "headshot-training",
      input: {
        archive_url: JSON.stringify([
          "https://v3b.fal.media/files/example/photo-1.jpg",
          "https://v3b.fal.media/files/example/photo-2.jpg"
        ]),
        steps: 1000
      }
    });

    expect(result.success).toBe(false);
  });

  it("rejects headshot training jobs below the fal.ai step floor", () => {
    const result = createJobSchema.safeParse({
      type: "headshot-training",
      input: {
        archive_url: "https://storage.googleapis.com/fal/example.zip",
        steps: 300
      }
    });

    expect(result.success).toBe(false);
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
      expect(result.data.type).toBe("headshot-generate");
      if (result.data.type !== "headshot-generate") throw new Error("Expected headshot-generate job");
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
        num_images: 5
      }
    });

    expect(result.success).toBe(false);
  });

  it("accepts headshot edit jobs with reference photos", () => {
    const result = createJobSchema.safeParse({
      type: "headshot-edit",
      input: {
        image_urls: [
          "https://v3b.fal.media/files/example/photo-1.jpg",
          "https://v3b.fal.media/files/example/photo-2.jpg",
          "https://v3b.fal.media/files/example/photo-3.jpg",
          "https://v3b.fal.media/files/example/photo-4.jpg"
        ],
        prompt: "Create a polished professional headshot.",
        quality: "low",
        num_images: 1
      }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("headshot-edit");
      if (result.data.type !== "headshot-edit") throw new Error("Expected headshot-edit job");
      expect(result.data.input.engine).toBe("gpt-image-2");
      expect(result.data.input.quality).toBe("low");
      expect(result.data.input.image_size).toBe("portrait_16_9");
      expect(result.data.input.num_images).toBe(1);
    }
  });

  it("accepts Nano Banana Pro headshot edits when selected", () => {
    const result = createJobSchema.safeParse({
      type: "headshot-edit",
      input: {
        image_urls: ["https://v3b.fal.media/files/example/photo-1.jpg"],
        prompt: "Create a polished professional headshot.",
        engine: "gemini-3-pro-image",
        quality: "low",
        image_size: "landscape_16_9",
        num_images: 1
      }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("headshot-edit");
      if (result.data.type !== "headshot-edit") throw new Error("Expected headshot-edit job");
      expect(result.data.input.engine).toBe("gemini-3-pro-image");
      expect(result.data.input.image_size).toBe("landscape_16_9");
    }
  });

  it("accepts headshot edit jobs with one reference photo", () => {
    const result = createJobSchema.safeParse({
      type: "headshot-edit",
      input: {
        image_urls: ["https://v3b.fal.media/files/example/photo-1.jpg"],
        prompt: "Create a polished professional headshot."
      }
    });

    expect(result.success).toBe(true);
  });

  it("rejects headshot edit jobs with more than four reference photos", () => {
    const result = createJobSchema.safeParse({
      type: "headshot-edit",
      input: {
        image_urls: [
          "https://v3b.fal.media/files/example/photo-1.jpg",
          "https://v3b.fal.media/files/example/photo-2.jpg",
          "https://v3b.fal.media/files/example/photo-3.jpg",
          "https://v3b.fal.media/files/example/photo-4.jpg",
          "https://v3b.fal.media/files/example/photo-5.jpg"
        ],
        prompt: "Create a polished professional headshot."
      }
    });

    expect(result.success).toBe(false);
  });

  it("charges headshot edits by output count and quality", () => {
    expect(gptImageEditProvider.calculateCredits?.({
      image_urls: ["https://v3b.fal.media/files/example/photo-1.jpg"],
      prompt: "Create a polished professional headshot.",
      quality: "low",
      num_images: 4
    })).toBe(4);

    expect(gptImageEditProvider.calculateCredits?.({
      image_urls: ["https://v3b.fal.media/files/example/photo-1.jpg"],
      prompt: "Create a polished professional headshot.",
      quality: "medium",
      num_images: 4
    })).toBe(8);

    expect(gptImageEditProvider.calculateCredits?.({
      image_urls: ["https://v3b.fal.media/files/example/photo-1.jpg"],
      prompt: "Create a polished professional headshot.",
      quality: "high",
      num_images: 4
    })).toBe(12);
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
