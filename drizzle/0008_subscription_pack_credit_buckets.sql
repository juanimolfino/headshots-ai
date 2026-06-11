DO $$ BEGIN
  CREATE TYPE "credit_bucket" AS ENUM ('subscription', 'pack');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "credits" ADD COLUMN IF NOT EXISTS "subscription_blue_balance" integer;
ALTER TABLE "credits" ADD COLUMN IF NOT EXISTS "subscription_gold_balance" integer;
ALTER TABLE "credits" ADD COLUMN IF NOT EXISTS "pack_blue_balance" integer;
ALTER TABLE "credits" ADD COLUMN IF NOT EXISTS "pack_gold_balance" integer;
ALTER TABLE "credits" ADD COLUMN IF NOT EXISTS "subscription_current_period_end" timestamp with time zone;
ALTER TABLE "credits" ADD COLUMN IF NOT EXISTS "subscription_status" text DEFAULT 'none';

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'credits'
      AND column_name = 'blue_balance'
  ) THEN
    UPDATE "credits"
    SET
      "pack_blue_balance" = COALESCE("pack_blue_balance", "blue_balance", 0),
      "pack_gold_balance" = COALESCE("pack_gold_balance", "gold_balance", 0),
      "subscription_blue_balance" = COALESCE("subscription_blue_balance", 0),
      "subscription_gold_balance" = COALESCE("subscription_gold_balance", 0),
      "subscription_status" = COALESCE("subscription_status", 'none');
  ELSE
    UPDATE "credits"
    SET
      "pack_blue_balance" = COALESCE("pack_blue_balance", 0),
      "pack_gold_balance" = COALESCE("pack_gold_balance", 0),
      "subscription_blue_balance" = COALESCE("subscription_blue_balance", 0),
      "subscription_gold_balance" = COALESCE("subscription_gold_balance", 0),
      "subscription_status" = COALESCE("subscription_status", 'none');
  END IF;
END $$;

ALTER TABLE "credits" ALTER COLUMN "subscription_blue_balance" SET DEFAULT 0;
ALTER TABLE "credits" ALTER COLUMN "subscription_gold_balance" SET DEFAULT 0;
ALTER TABLE "credits" ALTER COLUMN "pack_blue_balance" SET DEFAULT 0;
ALTER TABLE "credits" ALTER COLUMN "pack_gold_balance" SET DEFAULT 0;
ALTER TABLE "credits" ALTER COLUMN "subscription_status" SET DEFAULT 'none';
ALTER TABLE "credits" ALTER COLUMN "subscription_blue_balance" SET NOT NULL;
ALTER TABLE "credits" ALTER COLUMN "subscription_gold_balance" SET NOT NULL;
ALTER TABLE "credits" ALTER COLUMN "pack_blue_balance" SET NOT NULL;
ALTER TABLE "credits" ALTER COLUMN "pack_gold_balance" SET NOT NULL;
ALTER TABLE "credits" ALTER COLUMN "subscription_status" SET NOT NULL;

ALTER TABLE "credits" DROP COLUMN IF EXISTS "blue_balance";
ALTER TABLE "credits" DROP COLUMN IF EXISTS "gold_balance";

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "credit_bucket" "credit_bucket" DEFAULT 'pack' NOT NULL;
