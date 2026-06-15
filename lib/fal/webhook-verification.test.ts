import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyFalWebhookSignature } from "@/lib/fal/webhook-verification";

function signedHeaders(body: string, timestamp = "1800000000") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" });
  const requestId = "req_test";
  const userId = "user_test";
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const message = Buffer.from([requestId, userId, timestamp, bodyHash].join("\n"), "utf8");
  const signature = sign(null, message, privateKey).toString("hex");

  return {
    jwks: [{ kty: "OKP", crv: "Ed25519", x: jwk.x }],
    headers: new Headers({
      "X-Fal-Webhook-Request-Id": requestId,
      "X-Fal-Webhook-User-Id": userId,
      "X-Fal-Webhook-Timestamp": timestamp,
      "X-Fal-Webhook-Signature": signature
    })
  };
}

describe("verifyFalWebhookSignature", () => {
  it("accepts a valid ED25519 Fal webhook signature", async () => {
    const body = JSON.stringify({ request_id: "req_test", status: "OK" });
    const { headers, jwks } = signedHeaders(body);

    const result = await verifyFalWebhookSignature(body, headers, {
      jwks,
      now: new Date(1800000000 * 1000)
    });

    expect(result).toEqual({ ok: true, falRequestId: "req_test" });
  });

  it("rejects an invalid signature", async () => {
    const body = JSON.stringify({ request_id: "req_test", status: "OK" });
    const { headers, jwks } = signedHeaders(body);

    const result = await verifyFalWebhookSignature(`${body} `, headers, {
      jwks,
      now: new Date(1800000000 * 1000)
    });

    expect(result).toMatchObject({ ok: false, reason: "invalid_signature" });
  });

  it("rejects missing required headers", async () => {
    const result = await verifyFalWebhookSignature("{}", new Headers(), {
      jwks: [],
      now: new Date(1800000000 * 1000)
    });

    expect(result).toEqual({ ok: false, reason: "missing_headers" });
  });

  it("rejects timestamps outside the replay leeway", async () => {
    const body = "{}";
    const { headers, jwks } = signedHeaders(body, "1700000000");

    const result = await verifyFalWebhookSignature(body, headers, {
      jwks,
      now: new Date(1800000000 * 1000)
    });

    expect(result).toMatchObject({ ok: false, reason: "invalid_timestamp" });
  });
});
