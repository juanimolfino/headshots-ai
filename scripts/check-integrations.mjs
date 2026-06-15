import nextEnv from "@next/env";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import Stripe from "stripe";
import OpenAI from "openai";
import { Resend } from "resend";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const healthConfig = JSON.parse(readFileSync(new URL("../lib/health/config.json", import.meta.url), "utf8"));
const optional = new Set(["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "GEMINI_API_KEY"]);
const required = Object.values(healthConfig.integrations).flat().filter((key) => !optional.has(key));

function ok(label) {
  console.log(`OK   ${label}`);
}

function warn(label) {
  console.log(`WARN ${label}`);
}

function fail(label, error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`FAIL ${label}: ${message}`);
  process.exitCode = 1;
}

function cleanEnv(key) {
  return process.env[key]?.trim().replace(/^["']|["']$/g, "");
}

async function check(label, fn) {
  try {
    await fn();
    ok(label);
  } catch (error) {
    fail(label, error);
  }
}

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  fail("env vars", new Error(`missing ${missing.join(", ")}`));
} else {
  ok("env vars present");
}

await check("DATABASE_URL can query Postgres", async () => {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  await sql`select 1`;
  await sql.end();
});

await check("Supabase service role can list storage buckets", async () => {
  const supabase = createClient(
    cleanEnv("NEXT_PUBLIC_SUPABASE_URL"),
    cleanEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
  const { data, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  const bucketName = cleanEnv("SUPABASE_STORAGE_BUCKET") ?? "ai-results";
  const bucket = data.find((bucket) => bucket.name === bucketName);
  if (!bucket) {
    warn(`Supabase bucket "${bucketName}" not found`);
  } else if (bucket.public) {
    warn(`Supabase bucket "${bucketName}" is public; private buckets are recommended`);
  }
});

await check("Supabase anon key can initialize auth client", async () => {
  const supabase = createClient(
    cleanEnv("NEXT_PUBLIC_SUPABASE_URL"),
    cleanEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
  const { error } = await supabase.auth.getSession();
  if (error) throw error;
});

await check("Upstash Redis REST ping", async () => {
  const redis = new Redis({
    url: cleanEnv("UPSTASH_REDIS_REST_URL"),
    token: cleanEnv("UPSTASH_REDIS_REST_TOKEN")
  });
  const result = await redis.ping();
  if (result !== "PONG") throw new Error(`unexpected ping result ${result}`);
});

await check("Stripe secret key can retrieve balance", async () => {
  const stripe = new Stripe(cleanEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2025-08-27.basil"
  });
  await stripe.balance.retrieve();
});

await check("Stripe configured price IDs exist", async () => {
  const stripe = new Stripe(cleanEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2025-08-27.basil"
  });
  await Promise.all([
    stripe.prices.retrieve(cleanEnv("STRIPE_PRICE_ID_SUB_LITE")),
    stripe.prices.retrieve(cleanEnv("STRIPE_PRICE_ID_SUB_PRO")),
    stripe.prices.retrieve(cleanEnv("STRIPE_PRICE_ID_SUB_STUDIO")),
    stripe.prices.retrieve(cleanEnv("STRIPE_PRICE_ID_BLUE_STARTER")),
    stripe.prices.retrieve(cleanEnv("STRIPE_PRICE_ID_BLUE_POPULAR")),
    stripe.prices.retrieve(cleanEnv("STRIPE_PRICE_ID_BLUE_BEST_VALUE")),
    stripe.prices.retrieve(cleanEnv("STRIPE_PRICE_ID_GOLD_SINGLE")),
    stripe.prices.retrieve(cleanEnv("STRIPE_PRICE_ID_GOLD_TRIPLE"))
  ]);
});

await check("Fal JWKS endpoint is reachable", async () => {
  const response = await fetch("https://rest.alpha.fal.ai/.well-known/jwks.json", {
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`unexpected status ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.keys) || data.keys.length === 0) throw new Error("JWKS has no keys");
});

await check("Cloudflare R2 bucket is reachable", async () => {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${cleanEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cleanEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: cleanEnv("R2_SECRET_ACCESS_KEY")
    }
  });
  await client.send(new HeadBucketCommand({ Bucket: cleanEnv("R2_BUCKET_NAME") }));
});

await check("OpenAI API key can retrieve TTS model", async () => {
  const openai = new OpenAI({ apiKey: cleanEnv("OPENAI_API_KEY") });
  await openai.models.retrieve("gpt-4o-mini-tts");
});

await check("Resend API key can list domains", async () => {
  const resend = new Resend(cleanEnv("RESEND_API_KEY"));
  await resend.domains.list();
});

if (process.env.FAL_KEY) {
  ok("FAL_KEY present");
}

if (process.env.FAL_ADMIN_KEY) {
  ok("FAL_ADMIN_KEY present");
}

if (process.env.FAL_WEBHOOK_SECRET) {
  ok("FAL_WEBHOOK_SECRET present for legacy transition fallback");
}

if (process.env.GEMINI_API_KEY) {
  ok("GEMINI_API_KEY present for Nano Banana Pro fallback");
}

if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
  ok("Telegram alert env vars present");
} else {
  warn("Telegram alert env vars missing; operational alerts will only be in logs");
}

ok("Non-destructive checks finished");
