import type { HeadshotEditInput } from "@/lib/ai/types";

export const NANO_BANANA_PRO_MODEL = "gemini-3-pro-image";
const GEMINI_IMAGE_API_VERSION = "v1beta";

type GeminiPart = {
  text?: string;
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
};

async function imageUrlToInlineData(imageUrl: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Could not download reference image: ${response.status}`);

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const bytes = Buffer.from(await response.arrayBuffer());

  return {
    inlineData: {
      mimeType: contentType,
      data: bytes.toString("base64")
    }
  };
}

function getGeminiApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is required for Nano Banana Pro");
  return key;
}

async function generateOneNanoBananaProImage(input: HeadshotEditInput) {
  const parts = [
    { text: input.prompt },
    ...(await Promise.all(input.image_urls.slice(0, 4).map(imageUrlToInlineData)))
  ];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/${GEMINI_IMAGE_API_VERSION}/models/${NANO_BANANA_PRO_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": getGeminiApiKey()
      },
      body: JSON.stringify({
        contents: [{ parts }]
      })
    }
  );

  const data = (await response.json()) as GeminiGenerateResponse & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Gemini image edit failed with status ${response.status}`);
  }

  const inlineImage = data.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data)?.inlineData;
  if (!inlineImage?.data) throw new Error("Gemini Nano Banana Pro did not return an image");

  return `data:${inlineImage.mimeType ?? "image/png"};base64,${inlineImage.data}`;
}

export async function generateNanoBananaProEditUrls(input: HeadshotEditInput) {
  const count = Math.max(1, Math.min(4, input.num_images ?? 1));
  const images: string[] = [];
  for (let i = 0; i < count; i++) {
    images.push(await generateOneNanoBananaProImage(input));
  }
  return images;
}
