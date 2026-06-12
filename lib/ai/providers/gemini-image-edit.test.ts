import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FAL_NANO_BANANA_PRO_EDIT_ENDPOINT,
  GEMINI_IMAGE_API_VERSION,
  generateNanoBananaProEditUrls,
  NANO_BANANA_PRO_MODEL
} from "./gemini-image-edit";
import { fal } from "@fal-ai/client";

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn()
  }
}));

describe("generateNanoBananaProEditUrls", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("calls the fal Nano Banana Pro edit model", async () => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        images: [{ url: "https://v3b.fal.media/files/example/headshot.jpg" }]
      },
      requestId: "request-id"
    } as never);

    const result = await generateNanoBananaProEditUrls({
      image_urls: ["https://example.com/reference.jpg"],
      prompt: "Create a polished professional headshot.",
      engine: NANO_BANANA_PRO_MODEL,
      quality: "high",
      image_size: "landscape_16_9",
      num_images: 2
    });

    expect(result).toEqual(["https://v3b.fal.media/files/example/headshot.jpg"]);
    expect(fal.subscribe).toHaveBeenCalledWith(
      FAL_NANO_BANANA_PRO_EDIT_ENDPOINT,
      expect.objectContaining({
        input: {
          prompt: "Create a polished professional headshot.",
          image_urls: ["https://example.com/reference.jpg"],
          num_images: 2,
          aspect_ratio: "16:9",
          output_format: "jpeg",
          resolution: "4K"
        }
      })
    );
  });

  it("falls back to direct Gemini when fal fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(fal.subscribe).mockRejectedValue(new Error("fal credits exhausted"));
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url);
      if (requestUrl.includes("reference.jpg")) {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/jpeg" }
        });
      }

      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: "aW1hZ2U="
                  }
                }
              ]
            }
          }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateNanoBananaProEditUrls({
      image_urls: ["https://example.com/reference.jpg"],
      prompt: "Create a polished professional headshot.",
      engine: NANO_BANANA_PRO_MODEL,
      image_size: "portrait_16_9",
      num_images: 1
    });

    expect(result).toEqual(["data:image/png;base64,aW1hZ2U="]);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `https://generativelanguage.googleapis.com/${GEMINI_IMAGE_API_VERSION}/models/${NANO_BANANA_PRO_MODEL}:generateContent`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-goog-api-key": "test-gemini-key"
        })
      })
    );
  });
});
