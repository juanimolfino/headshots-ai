import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

function cleanEnv(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "") ?? "";
}

function getRedis() {
  if (!redis) {
    redis = new Redis({
      url: cleanEnv(process.env.UPSTASH_REDIS_REST_URL),
      token: cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN)
    });
  }
  return redis;
}

// Concurrent job slot — max 3 active jobs per user (10-minute TTL)
export async function reserveJobSlot(userId: string) {
  const max = Number(process.env.MAX_CONCURRENT_JOBS ?? 3);
  const key = `jobs:active:${userId}`;
  const client = getRedis();
  const count = await client.incr(key);
  await client.expire(key, 60 * 10);
  if (count > max) {
    await client.decr(key);
    throw new Error("RATE_LIMITED");
  }
}

export async function releaseJobSlot(userId: string) {
  const key = `jobs:active:${userId}`;
  const client = getRedis();
  const count = await client.decr(key);
  if (count <= 0) await client.del(key);
}

// Training rate limit — max 1 new training job per user per 5 minutes.
// Prevents accidental double-submissions and cost abuse (training ~$0.50–$1 each).
export async function checkTrainingRateLimit(userId: string) {
  const key = `training:rate:${userId}`;
  const client = getRedis();
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, 5 * 60);
  if (count > 1) {
    await client.decr(key);
    throw new Error("TRAINING_RATE_LIMITED");
  }
}

// Upload rate limit — max 20 upload-initiations per user per 2 minutes.
// 15 photos per training set × 2 attempts = 30 slack; 20 is a tight but fair bound.
export async function checkUploadRateLimit(userId: string) {
  const key = `upload:rate:${userId}`;
  const client = getRedis();
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, 2 * 60);
  if (count > 20) {
    throw new Error("UPLOAD_RATE_LIMITED");
  }
}

// Stripe Checkout session creation — max 6 sessions per user per 10 minutes.
export async function checkCheckoutRateLimit(userId: string) {
  const key = `checkout:rate:${userId}`;
  const client = getRedis();
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, 10 * 60);
  if (count > 6) throw new Error("CHECKOUT_RATE_LIMITED");
}

// Stripe Billing Portal session creation — max 6 sessions per user per 10 minutes.
export async function checkBillingPortalRateLimit(userId: string) {
  const key = `billing-portal:rate:${userId}`;
  const client = getRedis();
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, 10 * 60);
  if (count > 6) throw new Error("BILLING_PORTAL_RATE_LIMITED");
}

// Generic fixed-window counter — returns current count within the window.
export async function checkRateLimit(key: string, max: number, windowSeconds: number) {
  const client = getRedis();
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, windowSeconds);
  if (count > max) throw new Error("RATE_LIMITED");
}
