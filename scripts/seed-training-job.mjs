/**
 * Seed a completed headshot-training job for a given user email.
 * Downloads the LoRA from fal.storage, uploads it to Supabase Storage (permanent),
 * and inserts a done training job pointing to the Supabase path.
 *
 * Usage:
 *   node scripts/seed-training-job.mjs
 *
 * Override defaults with env vars:
 *   SEED_EMAIL=you@example.com SEED_LORA_URL=https://... SEED_TRIGGER_WORD=ohwx node scripts/seed-training-job.mjs
 */

import { randomUUID } from "crypto";
import { request } from "https";
import nextEnv from "@next/env";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const EMAIL = process.env.SEED_EMAIL ?? "juanimolfinooo@gmail.com";
const FAL_LORA_URL =
  process.env.SEED_LORA_URL ??
  "https://v3b.fal.media/files/b/0a9c1a63/KqumWGRucbsTzizh3YW-R_pytorch_lora_weights.safetensors";
const TRIGGER_WORD = process.env.SEED_TRIGGER_WORD ?? "ohwx";

function cleanEnv(key) {
  return process.env[key]?.trim().replace(/^["']|["']$/g, "");
}

const databaseUrl = cleanEnv("DATABASE_URL");
if (!databaseUrl) {
  console.error("FAIL DATABASE_URL is not set");
  process.exit(1);
}

const supabaseUrl = cleanEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = cleanEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) {
  console.error("FAIL NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
  process.exit(1);
}

const bucket = cleanEnv("SUPABASE_STORAGE_BUCKET") ?? "ai-results";
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const sql = postgres(databaseUrl, { prepare: false, max: 1 });

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const parsed = new URL(url);
    const options = { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { "User-Agent": "node/seed-script" } };
    request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(httpsGet(res.headers.location));
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`GET ${url} → HTTP ${res.statusCode}`)); return; }
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject).end();
  });
}

function uploadBufferToSupabase(buffer, storagePath) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/storage/v1/object/${bucket}/${storagePath}`, supabaseUrl);
    const options = {
      method: "POST",
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/octet-stream",
        "Content-Length": buffer.byteLength,
        "x-upsert": "true"
      }
    };
    const req = request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`Supabase upload HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on("error", reject);
    req.write(buffer);
    req.end();
  });
}

try {
  // 1. Find the user
  console.log(`[1/5] Looking up user: ${EMAIL}`);
  const users = await sql`SELECT id, email FROM users WHERE email = ${EMAIL} LIMIT 1`;
  if (!users.length) {
    console.error(`FAIL No user found with email: ${EMAIL}`);
    console.error("Make sure the user has logged in at least once so their profile exists.");
    process.exit(1);
  }
  const user = users[0];
  console.log(`      Found: ${user.id} (${user.email})`);

  // 2. Download the LoRA from fal.storage
  const fakeJobId = randomUUID();
  const storagePath = `loras/${user.id}/${fakeJobId}/model.safetensors`;
  console.log(`[2/5] Downloading LoRA from fal.storage...`);
  const loraBuffer = await httpsGet(FAL_LORA_URL);
  const fileSizeMb = (loraBuffer.byteLength / 1024 / 1024).toFixed(1);
  console.log(`      Downloaded: ${fileSizeMb} MB`);

  // 3. Upload to Supabase Storage via REST API (bypasses SDK fetch issues with large files)
  console.log(`[3/5] Uploading to Supabase Storage: ${storagePath}`);
  try {
    await uploadBufferToSupabase(loraBuffer, storagePath);
  } catch (err) {
    const msg = err.message ?? String(err);
    if (msg.includes("413") || msg.includes("exceeded")) {
      console.error("      → File too large. Go to Supabase Dashboard → Storage → Settings and set the max file size above 125 MB.");
    }
    throw new Error(`Supabase upload failed: ${msg}`);
  }
  console.log(`      Stored permanently in bucket "${bucket}"`);

  // 4. Insert the seeded training job with the Supabase path
  console.log(`[4/5] Inserting training job in DB...`);
  const now = new Date();
  const input = JSON.stringify({ archive_url: "seeded-manually", steps: 1000 });
  const metadata = JSON.stringify({ trigger_word: TRIGGER_WORD });
  const result = JSON.stringify({ lora_url: storagePath, trigger_word: TRIGGER_WORD });

  const [job] = await sql`
    INSERT INTO jobs (
      id, user_id, type, status, input, metadata,
      result_url, result, credits_used, completed_at, created_at, updated_at
    ) VALUES (
      ${fakeJobId}, ${user.id}, 'headshot-training', 'done',
      ${input}::jsonb, ${metadata}::jsonb,
      ${storagePath}, ${result}::jsonb,
      0, ${now}, ${now}, ${now}
    )
    RETURNING id
  `;
  console.log(`      Job ID: ${job.id}`);

  // 5. Generate a 1-hour signed URL to verify access
  console.log(`[5/5] Generating signed URL to verify access...`);
  const { data: signedData, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60);
  if (signError) throw new Error(`Could not create signed URL: ${signError.message}`);

  console.log(`\nOK   Training job seeded successfully`);
  console.log(`     User:          ${user.email}`);
  console.log(`     Job ID:        ${job.id}`);
  console.log(`     Storage path:  ${storagePath}`);
  console.log(`     Trigger word:  ${TRIGGER_WORD}`);
  console.log(`     Signed URL:    ${signedData.signedUrl}`);
  console.log(`\nOpen /dashboard/headshots — you should see the style picker directly.`);
  console.log(`Click "Generar mis headshots" to test the full generation pipeline.`);
} catch (error) {
  console.error("FAIL", error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await sql.end();
}
