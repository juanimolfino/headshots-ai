import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("upload initiate privacy gate", () => {
  const source = readFileSync(join(process.cwd(), "app/api/upload/initiate/route.ts"), "utf8");

  it("requires upload purpose and consent before issuing Fal signed upload URLs", () => {
    expect(source).toContain('purpose must be training-source or quick-edit-reference');
    expect(source).toContain("hasCurrentLegalConsent(profile)");
    expect(source).toContain("hasCurrentPhotoProcessingConsent(profile)");
    expect(source).toContain("initiateFalStorageUpload");
    expect(source).toContain("FAL_SOURCE_OBJECT_EXPIRATION_SECONDS");
    expect(source).toContain("expirationSeconds: FAL_SOURCE_OBJECT_EXPIRATION_SECONDS");
  });
});
