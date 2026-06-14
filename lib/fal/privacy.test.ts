import { describe, expect, it, vi } from "vitest";
import {
  deleteFalRequestPayloads,
  FAL_OBJECT_LIFECYCLE_HEADER,
  FAL_SOURCE_OBJECT_EXPIRATION_SECONDS,
  falObjectLifecyclePreference,
  initiateFalStorageUpload
} from "@/lib/fal/privacy";

describe("Fal privacy helpers", () => {
  it("requests short-lived storage uploads with the lifecycle preference header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ upload_url: "https://upload.fal.ai", file_url: "https://fal.media/source.jpg" })
    });

    await initiateFalStorageUpload({
      filename: "source.jpg",
      contentType: "image/jpeg",
      expirationSeconds: FAL_SOURCE_OBJECT_EXPIRATION_SECONDS
    }, fetchMock as unknown as typeof fetch);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          [FAL_OBJECT_LIFECYCLE_HEADER]: falObjectLifecyclePreference(FAL_SOURCE_OBJECT_EXPIRATION_SECONDS)
        })
      })
    );
  });

  it("deletes request payloads through the Fal Platform API when a request id exists", async () => {
    process.env.FAL_ADMIN_KEY = "fal_admin_key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => ""
    });

    const result = await deleteFalRequestPayloads("req_123", {
      reason: "test",
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.fal.ai/v1/models/requests/req_123/payloads",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ Authorization: "Key fal_admin_key" }),
        body: JSON.stringify({ reason: "test" })
      })
    );
  });
});
