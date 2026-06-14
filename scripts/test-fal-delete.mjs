#!/usr/bin/env node

const { default: nextEnv } = await import("@next/env");
nextEnv.loadEnvConfig(process.cwd());

const FAL_STORAGE_INITIATE_URL = "https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3";
const FAL_DELETE_ENDPOINT = "https://api.fal.ai/v1/models/requests";
const FAL_TEST_ENDPOINT = process.env.FAL_DELETE_TEST_ENDPOINT || "fal-ai/flux/schnell";
const FAL_OBJECT_LIFECYCLE_HEADER = "X-Fal-Object-Lifecycle-Preference";

function selectKey() {
  if (process.env.FAL_ADMIN_KEY) {
    return { name: "FAL_ADMIN_KEY", value: process.env.FAL_ADMIN_KEY };
  }
  if (process.env.FAL_KEY) {
    return { name: "FAL_KEY", value: process.env.FAL_KEY };
  }
  return null;
}

function maskKey(key) {
  if (key.length <= 10) return `${key.slice(0, 2)}***`;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return "";
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function verdict(status) {
  if (status >= 200 && status < 300) return "BORRADO OK";
  if (status === 401 || status === 403) return "FALLO DE AUTH";
  return "OTRO ERROR";
}

async function uploadTinyFile(key) {
  const filename = `fal-delete-test-${Date.now()}.txt`;
  const initiateResponse = await fetch(FAL_STORAGE_INITIATE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
      [FAL_OBJECT_LIFECYCLE_HEADER]: JSON.stringify({ expiration_duration_seconds: 3600 })
    },
    body: JSON.stringify({
      content_type: "text/plain",
      file_name: filename
    })
  });
  const initiateBody = await initiateResponse.json().catch(() => ({}));
  console.log("[storage:initiate] status:", initiateResponse.status);
  console.log("[storage:initiate] response:", JSON.stringify(initiateBody, null, 2));

  if (!initiateResponse.ok || !initiateBody.upload_url || !initiateBody.file_url) {
    throw new Error(`Fal storage initiate failed with status ${initiateResponse.status}`);
  }

  const uploadResponse = await fetch(initiateBody.upload_url, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: `fal delete test ${new Date().toISOString()}\n`
  });
  const uploadText = await uploadResponse.text();
  console.log("[storage:put] status:", uploadResponse.status);
  if (uploadText) console.log("[storage:put] response:", uploadText);
  if (!uploadResponse.ok) throw new Error(`Fal storage PUT failed with status ${uploadResponse.status}`);

  return initiateBody.file_url;
}

async function createFalRequest(key, fileUrl) {
  const { fal } = await import("@fal-ai/client");
  fal.config({ credentials: key });
  const submit = await fal.queue.submit(FAL_TEST_ENDPOINT, {
    input: {
      prompt: `minimal platform delete verification test. reference file: ${fileUrl}`
    },
    headers: {
      [FAL_OBJECT_LIFECYCLE_HEADER]: JSON.stringify({ expiration_duration_seconds: 3600 })
    }
  });
  const requestId = submit.request_id;
  console.log("[request:create] endpoint:", FAL_TEST_ENDPOINT);
  console.log("[request:create] request_id:", requestId);

  const started = Date.now();
  while (Date.now() - started < 90_000) {
    const status = await fal.queue.status(FAL_TEST_ENDPOINT, { requestId, logs: false });
    console.log("[request:status]", status.status);
    if (status.status === "COMPLETED") {
      const result = await fal.queue.result(FAL_TEST_ENDPOINT, { requestId });
      console.log("[request:result] received:", Boolean(result.data));
      return requestId;
    }
    if (status.status === "FAILED" || status.status === "CANCELLED") {
      throw new Error(`Fal request ended as ${status.status}`);
    }
    await new Promise(resolve => setTimeout(resolve, 3_000));
  }

  console.log("[request:status] timed out waiting for completion; testing delete on submitted request anyway.");
  return requestId;
}

async function deleteRequestPayloads(key, requestId) {
  const response = await fetch(`${FAL_DELETE_ENDPOINT}/${encodeURIComponent(requestId)}/payloads`, {
    method: "DELETE",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ reason: "platform_api_delete_verification" })
  });
  const body = await readResponse(response);
  console.log("[delete] request_id:", requestId);
  console.log("[delete] status:", response.status);
  console.log("[delete] response:", body || "(empty)");
  console.log("[delete] verdict:", verdict(response.status));
  return response.status;
}

const selected = selectKey();
if (!selected) {
  console.error("Missing FAL_ADMIN_KEY or FAL_KEY in the environment.");
  process.exit(1);
}

console.log("[key] using:", selected.name);
console.log("[key] masked:", maskKey(selected.value));

try {
  let requestId = process.env.FAL_DELETE_TEST_REQUEST_ID;
  if (requestId) {
    console.log("[request:create] skipped; using FAL_DELETE_TEST_REQUEST_ID:", requestId);
  } else {
    const fileUrl = await uploadTinyFile(selected.value);
    console.log("[storage] file_url:", fileUrl);
    requestId = await createFalRequest(selected.value, fileUrl);
  }
  const status = await deleteRequestPayloads(selected.value, requestId);
  process.exit(status >= 200 && status < 300 ? 0 : 2);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[fatal]", message);
  if (/401|403|unauthorized|forbidden/i.test(message)) {
    console.error("[delete] verdict: FALLO DE AUTH");
    process.exit(2);
  }
  console.error("[delete] verdict: OTRO ERROR");
  process.exit(2);
}
