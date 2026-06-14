import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeStoragePath } from "@/lib/ai/storage";

describe("normalizeStoragePath", () => {
  it("keeps object paths unchanged", () => {
    expect(normalizeStoragePath("user-1/job-1.png", "ai-results")).toBe("user-1/job-1.png");
  });

  it("extracts object paths from public Supabase URLs", () => {
    const url = "https://example.supabase.co/storage/v1/object/public/ai-results/user-1/job%201.png";

    expect(normalizeStoragePath(url, "ai-results")).toBe("user-1/job 1.png");
  });

  it("extracts object paths from signed Supabase URLs", () => {
    const url = "https://example.supabase.co/storage/v1/object/sign/ai-results/user-1/job-1.mp3?token=abc";

    expect(normalizeStoragePath(url, "ai-results")).toBe("user-1/job-1.mp3");
  });

  it("returns null for unrelated URLs", () => {
    expect(normalizeStoragePath("https://cdn.example.com/file.png", "ai-results")).toBeNull();
  });

  it("keeps the result flow compatible with private buckets and signed URLs", () => {
    const workerSource = readFileSync(join(process.cwd(), "lib/inngest/functions.ts"), "utf8");
    const signedUrlRoute = readFileSync(join(process.cwd(), "app/api/jobs/[id]/signed-urls/route.ts"), "utf8");

    expect(workerSource).toContain("return input.path");
    expect(workerSource).not.toContain("getPublicUrl(input.path).data.publicUrl");
    expect(signedUrlRoute).toContain("createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)");
  });
});
