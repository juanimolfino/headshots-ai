import { afterEach, describe, expect, it, vi } from "vitest";
import { fal } from "@fal-ai/client";
import { generateGptImageEditUrls } from "./gpt-image-edit";

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn()
  }
}));

describe("generateGptImageEditUrls", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("preserves original size and returns PNG by default", async () => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        images: [{ url: "https://v3b.fal.media/files/example/edit.png" }]
      },
      requestId: "request-id"
    } as never);

    const result = await generateGptImageEditUrls({
      image_urls: ["https://example.com/reference.png"],
      prompt: "Recover the real colors while preserving the original photo.",
      engine: "gpt-image-2",
      quality: "low",
      image_size: "auto",
      num_images: 1
    });

    expect(result).toEqual(["https://v3b.fal.media/files/example/edit.png"]);
    expect(fal.subscribe).toHaveBeenCalledWith(
      "openai/gpt-image-2/edit",
      expect.objectContaining({
        input: expect.objectContaining({
          image_size: "auto",
          output_format: "png"
        })
      })
    );
  });
});
