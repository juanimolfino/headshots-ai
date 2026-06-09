DO $$ BEGIN
  CREATE TYPE "credit_kind" AS ENUM ('blue', 'gold');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "credits" ADD COLUMN IF NOT EXISTS "blue_balance" integer;
ALTER TABLE "credits" ADD COLUMN IF NOT EXISTS "gold_balance" integer;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'credits'
      AND column_name = 'balance'
  ) THEN
    UPDATE "credits"
    SET
      "blue_balance" = COALESCE("blue_balance", "balance", 0),
      "gold_balance" = COALESCE("gold_balance", 0);
  ELSE
    UPDATE "credits"
    SET
      "blue_balance" = COALESCE("blue_balance", 0),
      "gold_balance" = COALESCE("gold_balance", 0);
  END IF;
END $$;

ALTER TABLE "credits" ALTER COLUMN "blue_balance" SET DEFAULT 0;
ALTER TABLE "credits" ALTER COLUMN "gold_balance" SET DEFAULT 0;
ALTER TABLE "credits" ALTER COLUMN "blue_balance" SET NOT NULL;
ALTER TABLE "credits" ALTER COLUMN "gold_balance" SET NOT NULL;
ALTER TABLE "credits" DROP COLUMN IF EXISTS "balance";

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "credit_kind" "credit_kind" DEFAULT 'blue' NOT NULL;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "credit_kind" "credit_kind" DEFAULT 'blue' NOT NULL;
