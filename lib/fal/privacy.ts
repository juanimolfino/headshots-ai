export const FAL_SOURCE_OBJECT_EXPIRATION_SECONDS = 48 * 60 * 60;
export const FAL_GENERATED_OBJECT_EXPIRATION_SECONDS = 48 * 60 * 60;
export const FAL_OBJECT_LIFECYCLE_HEADER = "X-Fal-Object-Lifecycle-Preference";

export type FalCleanupResult = {
  ok: boolean;
  status?: number;
  skipped?: boolean;
  message?: string;
};

type FetchLike = typeof fetch;

function getFalApiKey() {
  return process.env.FAL_ADMIN_KEY || process.env.FAL_KEY || "";
}

export function falObjectLifecyclePreference(expirationSeconds = FAL_SOURCE_OBJECT_EXPIRATION_SECONDS) {
  return JSON.stringify({ expiration_duration_seconds: expirationSeconds });
}

export function falPrivacyHeaders(expirationSeconds = FAL_GENERATED_OBJECT_EXPIRATION_SECONDS) {
  return {
    [FAL_OBJECT_LIFECYCLE_HEADER]: falObjectLifecyclePreference(expirationSeconds),
    "X-Fal-Store-IO": "0"
  };
}

export async function initiateFalStorageUpload(
  input: { filename: string; contentType: string; expirationSeconds?: number },
  fetchImpl: FetchLike = fetch
) {
  const response = await fetchImpl("https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json",
      [FAL_OBJECT_LIFECYCLE_HEADER]: falObjectLifecyclePreference(input.expirationSeconds)
    },
    body: JSON.stringify({
      content_type: input.contentType,
      file_name: input.filename
    })
  });

  const data = (await response.json()) as { upload_url?: string; file_url?: string; detail?: unknown };
  return { response, data };
}

export async function uploadFalStorageFile(
  input: { file: File; filename: string; contentType: string; expirationSeconds?: number },
  fetchImpl: FetchLike = fetch
) {
  const { response, data } = await initiateFalStorageUpload({
    filename: input.filename,
    contentType: input.contentType,
    expirationSeconds: input.expirationSeconds
  }, fetchImpl);
  if (!response.ok || !data.upload_url || !data.file_url) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Could not initiate fal.storage upload");
  }

  const uploadResponse = await fetchImpl(data.upload_url, {
    method: "PUT",
    headers: { "Content-Type": input.contentType },
    body: input.file
  });
  if (!uploadResponse.ok) throw new Error(`Could not upload ${input.filename} to fal.storage`);
  return data.file_url;
}

export async function deleteFalRequestPayloads(
  requestId: string | null | undefined,
  input: { reason?: string; fetchImpl?: FetchLike } = {}
): Promise<FalCleanupResult> {
  if (!requestId) return { ok: true, skipped: true, message: "missing request id" };
  const apiKey = getFalApiKey();
  if (!apiKey) return { ok: true, skipped: true, message: "missing fal api key" };

  try {
    const response = await (input.fetchImpl ?? fetch)(
      `https://api.fal.ai/v1/models/requests/${encodeURIComponent(requestId)}/payloads`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reason: input.reason ?? "user_data_cleanup" })
      }
    );

    if (response.ok || response.status === 404) {
      return { ok: true, status: response.status };
    }

    return { ok: false, status: response.status, message: await response.text() };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteFalRequestPayloadsBestEffort(
  requestId: string | null | undefined,
  context: { jobId?: string; reason?: string } = {}
) {
  const result = await deleteFalRequestPayloads(requestId, { reason: context.reason });
  console.log("[fal-cleanup] request payload cleanup", {
    requestId,
    jobId: context.jobId,
    ...result
  });
  return result;
}
