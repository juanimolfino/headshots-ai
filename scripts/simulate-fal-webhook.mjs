/**
 * Simulates fal.ai completing a training job by firing the webhook manually.
 * Use this with FAL_MOCK_TRAINING=true to test the full Inngest flow without
 * paying for a real fal.ai training run.
 *
 * Usage:
 *   node scripts/simulate-fal-webhook.mjs <jobId> [loraUrl]
 *
 * If loraUrl is omitted, uses SEED_LORA_URL from .env.local or the hardcoded default.
 *
 * Workflow:
 *   1. Set FAL_MOCK_TRAINING=true in .env.local
 *   2. Start the app + Inngest dev server (npx inngest-cli@latest dev)
 *   3. Upload photos in the UI and click "Entrenar modelo" — Inngest will pause at waitForEvent
 *   4. Copy the job ID from the Inngest dashboard (or DB) and run this script
 *   5. The job completes and the model appears in the UI
 */

import { request } from "https";
import { request as httpRequest } from "http";
import nextEnv from "@next/env";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const [, , jobId, cliLoraUrl] = process.argv;
if (!jobId) {
  console.error("Usage: node scripts/simulate-fal-webhook.mjs <jobId> [loraUrl]");
  process.exit(1);
}

const DEFAULT_LORA_URL =
  process.env.SEED_LORA_URL ??
  "https://v3b.fal.media/files/b/0a9c1a63/KqumWGRucbsTzizh3YW-R_pytorch_lora_weights.safetensors";

const LORA_URL = cliLoraUrl ?? DEFAULT_LORA_URL;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

function cleanEnv(key) {
  return process.env[key]?.trim().replace(/^["']|["']$/g, "");
}

const databaseUrl = cleanEnv("DATABASE_URL");
if (!databaseUrl) {
  console.error("FAIL DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(databaseUrl, { prepare: false, max: 1 });

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const isHttps = parsed.protocol === "https:";
    const mod = isHttps ? request : httpRequest;

    const options = {
      method: "POST",
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    };

    const req = mod(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

try {
  // 1. Read job metadata to get the fal_request_id
  console.log(`[1/3] Reading job metadata for: ${jobId}`);
  const rows = await sql`SELECT id, status, metadata FROM jobs WHERE id = ${jobId} LIMIT 1`;
  if (!rows.length) {
    console.error(`FAIL No job found with id: ${jobId}`);
    process.exit(1);
  }

  const job = rows[0];
  const metadata = typeof job.metadata === "string" ? JSON.parse(job.metadata) : (job.metadata ?? {});
  const falRequestId = metadata.fal_request_id;

  console.log(`      Job status:    ${job.status}`);
  console.log(`      fal_request_id: ${falRequestId ?? "(not found)"}`);

  if (!falRequestId) {
    console.error("FAIL fal_request_id not found in job metadata.");
    console.error("     Make sure FAL_MOCK_TRAINING=true is set and the job ran through the 'submit to fal trainer' step.");
    process.exit(1);
  }

  // 2. POST to the webhook endpoint
  const webhookUrl = `${APP_URL}/api/webhooks/fal`;
  const payload = {
    request_id: falRequestId,
    status: "OK",
    payload: {
      diffusers_lora_file: {
        url: LORA_URL,
        file_name: "pytorch_lora_weights.safetensors",
        content_type: "application/octet-stream"
      },
      config_file: null
    },
    error: null
  };

  console.log(`[2/3] Firing webhook: POST ${webhookUrl}`);
  console.log(`      request_id: ${falRequestId}`);
  console.log(`      lora_url:   ${LORA_URL}`);

  const response = await httpPost(webhookUrl, payload);
  console.log(`      HTTP ${response.status}: ${response.body}`);

  if (response.status !== 200) {
    console.error(`FAIL Webhook returned HTTP ${response.status}`);
    process.exit(1);
  }

  // 3. Done
  console.log(`\n[3/3] Check Inngest dashboard — the run should now resume.`);
  console.log(`      The model will appear in the UI once the job completes.`);
  console.log(`\nOK   Webhook fired successfully for job: ${jobId}`);
} catch (error) {
  console.error("FAIL", error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await sql.end();
}
