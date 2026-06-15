import { createHash, createPublicKey, verify } from "node:crypto";

export const FAL_JWKS_URL = "https://rest.alpha.fal.ai/.well-known/jwks.json";
export const FAL_JWKS_CACHE_MS = 24 * 60 * 60 * 1000;
export const FAL_WEBHOOK_TIMESTAMP_LEEWAY_SECONDS = 5 * 60;

type FalJwk = {
  kty?: string;
  crv?: string;
  kid?: string;
  x?: string;
  use?: string;
};

type FalJwks = {
  keys?: FalJwk[];
};

type VerifyOptions = {
  now?: Date;
  fetchImpl?: typeof fetch;
  jwks?: FalJwk[];
};

type FalWebhookHeaders = {
  requestId: string;
  userId: string;
  timestamp: string;
  signature: string;
};

let jwksCache: {
  keys: FalJwk[];
  fetchedAt: number;
} | null = null;

export function clearFalJwksCacheForTests() {
  jwksCache = null;
}

function requiredHeader(headers: Headers, name: string) {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? "";
}

export function getFalWebhookHeaders(headers: Headers): FalWebhookHeaders | null {
  const requestId = requiredHeader(headers, "X-Fal-Webhook-Request-Id");
  const userId = requiredHeader(headers, "X-Fal-Webhook-User-Id");
  const timestamp = requiredHeader(headers, "X-Fal-Webhook-Timestamp");
  const signature = requiredHeader(headers, "X-Fal-Webhook-Signature");
  if (!requestId || !userId || !timestamp || !signature) return null;
  return { requestId, userId, timestamp, signature };
}

async function fetchFalJwks(fetchImpl: typeof fetch) {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < FAL_JWKS_CACHE_MS) return jwksCache.keys;

  const response = await fetchImpl(FAL_JWKS_URL, {
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Fal JWKS fetch failed with status ${response.status}`);
  const data = await response.json() as FalJwks;
  const keys = Array.isArray(data.keys) ? data.keys : [];
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

function isValidTimestamp(timestamp: string, now: Date) {
  if (!/^\d+$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) return false;
  const nowSeconds = Math.floor(now.getTime() / 1000);
  return Math.abs(nowSeconds - timestampSeconds) <= FAL_WEBHOOK_TIMESTAMP_LEEWAY_SECONDS;
}

function buildSignedMessage(headers: FalWebhookHeaders, rawBody: string | Buffer) {
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  return Buffer.from([
    headers.requestId,
    headers.userId,
    headers.timestamp,
    bodyHash
  ].join("\n"), "utf8");
}

function decodeSignature(signatureHex: string) {
  if (!/^[0-9a-f]+$/i.test(signatureHex) || signatureHex.length % 2 !== 0) return null;
  return Buffer.from(signatureHex, "hex");
}

function verifyWithKey(jwk: FalJwk, message: Buffer, signature: Buffer) {
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.x !== "string") return false;
  try {
    const publicKey = createPublicKey({
      key: {
        kty: "OKP",
        crv: "Ed25519",
        x: jwk.x
      },
      format: "jwk"
    });
    return verify(null, message, publicKey, signature);
  } catch {
    return false;
  }
}

export async function verifyFalWebhookSignature(rawBody: string | Buffer, headers: Headers, options: VerifyOptions = {}) {
  const falHeaders = getFalWebhookHeaders(headers);
  if (!falHeaders) {
    return { ok: false as const, reason: "missing_headers" };
  }

  if (!isValidTimestamp(falHeaders.timestamp, options.now ?? new Date())) {
    return { ok: false as const, reason: "invalid_timestamp", falRequestId: falHeaders.requestId };
  }

  const signature = decodeSignature(falHeaders.signature);
  if (!signature) {
    return { ok: false as const, reason: "invalid_signature_format", falRequestId: falHeaders.requestId };
  }

  const keys = options.jwks ?? await fetchFalJwks(options.fetchImpl ?? fetch);
  const message = buildSignedMessage(falHeaders, rawBody);
  const verified = keys.some(key => verifyWithKey(key, message, signature));
  if (!verified) {
    return { ok: false as const, reason: "invalid_signature", falRequestId: falHeaders.requestId };
  }

  return { ok: true as const, falRequestId: falHeaders.requestId };
}
