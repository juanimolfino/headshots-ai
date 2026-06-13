import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("two-credit balance migration", () => {
  const sql = readFileSync(join(process.cwd(), "drizzle/0007_two_credit_balances.sql"), "utf8");
  const bucketSql = readFileSync(join(process.cwd(), "drizzle/0008_subscription_pack_credit_buckets.sql"), "utf8");
  const subscriptionEventSql = readFileSync(join(process.cwd(), "drizzle/0009_subscription_event_ordering.sql"), "utf8");

  it("moves the legacy balance into blue_balance and starts gold_balance at zero", () => {
    expect(sql).toContain('"blue_balance" = COALESCE("blue_balance", "balance", 0)');
    expect(sql).toContain('"gold_balance" = COALESCE("gold_balance", 0)');
    expect(sql).toContain('DROP COLUMN IF EXISTS "balance"');
  });

  it("records credit kind on jobs and transactions", () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "credit_kind" "credit_kind" DEFAULT \'blue\' NOT NULL');
    expect(sql).toContain('CREATE TYPE "credit_kind" AS ENUM (\'blue\', \'gold\')');
  });

  it("moves existing blue and gold balances into permanent pack balances", () => {
    expect(bucketSql).toContain('"pack_blue_balance" = COALESCE("pack_blue_balance", "blue_balance", 0)');
    expect(bucketSql).toContain('"pack_gold_balance" = COALESCE("pack_gold_balance", "gold_balance", 0)');
    expect(bucketSql).toContain('"subscription_blue_balance" = COALESCE("subscription_blue_balance", 0)');
    expect(bucketSql).toContain('"subscription_gold_balance" = COALESCE("subscription_gold_balance", 0)');
    expect(bucketSql).toContain('DROP COLUMN IF EXISTS "blue_balance"');
    expect(bucketSql).toContain('DROP COLUMN IF EXISTS "gold_balance"');
  });

  it("records the affected credit bucket on transactions", () => {
    expect(bucketSql).toContain('CREATE TYPE "credit_bucket" AS ENUM (\'subscription\', \'pack\')');
    expect(bucketSql).toContain('ADD COLUMN IF NOT EXISTS "credit_bucket" "credit_bucket" DEFAULT \'pack\' NOT NULL');
  });

  it("records the last processed Stripe subscription event", () => {
    expect(subscriptionEventSql).toContain('ADD COLUMN IF NOT EXISTS "last_stripe_event_id" text');
    expect(subscriptionEventSql).toContain('ADD COLUMN IF NOT EXISTS "last_stripe_event_created_at" timestamp with time zone');
  });
});
