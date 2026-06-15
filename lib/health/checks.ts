import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { sql } from "drizzle-orm";
import { Resend } from "resend";
import Stripe from "stripe";
import healthConfig from "@/lib/health/config.json";
import { getDb } from "@/lib/db";

type IntegrationName = keyof typeof healthConfig.integrations;
type HealthStatus = "ok" | "missing" | "error";

type IntegrationHealth = {
  status: HealthStatus;
  missing?: string[];
  detail?: unknown;
  error?: string;
};

const optionalIntegrations = new Set<IntegrationName>(["telegram", "gemini"]);

function cleanEnv(key: string) {
  return process.env[key]?.trim().replace(/^["']|["']$/g, "") ?? "";
}

function missingEnv(keys: readonly string[]) {
  return keys.filter(key => !cleanEnv(key));
}

function envStatus(name: IntegrationName): IntegrationHealth {
  const keys = healthConfig.integrations[name];
  const missing = missingEnv(keys);
  if (missing.length) return { status: "missing", missing };
  return { status: "ok" };
}

async function timed<T>(fn: () => Promise<T>) {
  const startedAt = Date.now();
  const result = await fn();
  return { result, durationMs: Date.now() - startedAt };
}

async function checkDatabase(): Promise<IntegrationHealth> {
  const base = envStatus("database");
  if (base.status !== "ok") return base;
  try {
    const { result, durationMs } = await timed(async () => getDb().execute(sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('users', 'credits', 'jobs', 'subscriptions', 'transactions')
      order by table_name
    `));
    return {
      status: "ok",
      detail: {
        durationMs,
        tables: result.map((row) => row.table_name)
      }
    };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkSupabase(): Promise<IntegrationHealth> {
  const base = envStatus("supabase");
  const missing = missingEnv(healthConfig.integrations.supabase.filter(key => key !== "SUPABASE_STORAGE_BUCKET"));
  if (missing.length) return { status: "missing", missing };
  try {
    const { result, durationMs } = await timed(async () => {
      const supabase = createClient(cleanEnv("NEXT_PUBLIC_SUPABASE_URL"), cleanEnv("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false }
      });
      const { data, error } = await supabase.storage.listBuckets();
      if (error) throw error;
      const bucketName = cleanEnv("SUPABASE_STORAGE_BUCKET") || "ai-results";
      const bucket = data?.find(item => item.name === bucketName);
      return { bucket: bucketName, bucketFound: Boolean(bucket), bucketPublic: bucket?.public ?? null };
    });
    return { status: base.status === "missing" ? "missing" : "ok", missing: base.missing, detail: { ...result, durationMs } };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkUpstash(): Promise<IntegrationHealth> {
  const base = envStatus("upstash");
  if (base.status !== "ok") return base;
  try {
    const { result, durationMs } = await timed(async () => {
      const redis = new Redis({
        url: cleanEnv("UPSTASH_REDIS_REST_URL"),
        token: cleanEnv("UPSTASH_REDIS_REST_TOKEN")
      });
      return redis.ping();
    });
    return result === "PONG"
      ? { status: "ok", detail: { durationMs } }
      : { status: "error", error: `unexpected ping result ${String(result)}` };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkStripe(): Promise<IntegrationHealth> {
  const base = envStatus("stripe");
  if (base.status !== "ok") return base;
  try {
    const { durationMs } = await timed(async () => {
      const stripe = new Stripe(cleanEnv("STRIPE_SECRET_KEY"), { apiVersion: "2025-08-27.basil" });
      await stripe.balance.retrieve();
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
    return { status: "ok", detail: { durationMs } };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkFal(): Promise<IntegrationHealth> {
  const base = envStatus("fal");
  if (base.status !== "ok") return base;
  try {
    const { result, durationMs } = await timed(async () => {
      const response = await fetch("https://rest.alpha.fal.ai/.well-known/jwks.json", {
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new Error(`JWKS status ${response.status}`);
      const data = await response.json() as { keys?: unknown[] };
      return { jwksKeys: Array.isArray(data.keys) ? data.keys.length : 0 };
    });
    return { status: result.jwksKeys > 0 ? "ok" : "error", detail: { ...result, durationMs } };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkR2(): Promise<IntegrationHealth> {
  const base = envStatus("r2");
  if (base.status !== "ok") return base;
  try {
    const { durationMs } = await timed(async () => {
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
    return { status: "ok", detail: { bucket: cleanEnv("R2_BUCKET_NAME"), durationMs } };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkResend(): Promise<IntegrationHealth> {
  const base = envStatus("resend");
  if (base.status !== "ok") return base;
  try {
    const { durationMs } = await timed(async () => {
      const resend = new Resend(cleanEnv("RESEND_API_KEY"));
      await resend.domains.list();
    });
    return { status: "ok", detail: { fromConfigured: Boolean(cleanEnv("RESEND_FROM_EMAIL")), durationMs } };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

function checkPresenceOnly(name: IntegrationName): IntegrationHealth {
  return envStatus(name);
}

export function getConfiguredHealthEnvKeys() {
  return healthConfig.integrations;
}

export function getHealthEnvStatus() {
  return Object.fromEntries(
    (Object.keys(healthConfig.integrations) as IntegrationName[]).map(name => [name, envStatus(name)])
  ) as Record<IntegrationName, IntegrationHealth>;
}

export async function getHealthChecks() {
  const integrations: Record<IntegrationName, IntegrationHealth> = {
    supabase: await checkSupabase(),
    database: await checkDatabase(),
    stripe: await checkStripe(),
    fal: await checkFal(),
    r2: await checkR2(),
    inngest: checkPresenceOnly("inngest"),
    upstash: await checkUpstash(),
    resend: await checkResend(),
    openai: checkPresenceOnly("openai"),
    gemini: checkPresenceOnly("gemini"),
    telegram: checkPresenceOnly("telegram"),
    app: checkPresenceOnly("app")
  };

  const degraded = Object.entries(integrations).filter(([name, check]) =>
    check.status !== "ok" && !optionalIntegrations.has(name as IntegrationName)
  );

  return {
    ok: degraded.length === 0,
    timestamp: new Date().toISOString(),
    integrations
  };
}
