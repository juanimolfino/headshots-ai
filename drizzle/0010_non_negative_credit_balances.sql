DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "credits"
    WHERE
      "subscription_blue_balance" < 0 OR
      "subscription_gold_balance" < 0 OR
      "pack_blue_balance" < 0 OR
      "pack_gold_balance" < 0
  ) THEN
    RAISE EXCEPTION 'Cannot add non-negative credit balance constraints: credits table contains negative balances';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credits_subscription_blue_balance_non_negative'
  ) THEN
    ALTER TABLE "credits"
      ADD CONSTRAINT "credits_subscription_blue_balance_non_negative"
      CHECK ("subscription_blue_balance" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credits_subscription_gold_balance_non_negative'
  ) THEN
    ALTER TABLE "credits"
      ADD CONSTRAINT "credits_subscription_gold_balance_non_negative"
      CHECK ("subscription_gold_balance" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credits_pack_blue_balance_non_negative'
  ) THEN
    ALTER TABLE "credits"
      ADD CONSTRAINT "credits_pack_blue_balance_non_negative"
      CHECK ("pack_blue_balance" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credits_pack_gold_balance_non_negative'
  ) THEN
    ALTER TABLE "credits"
      ADD CONSTRAINT "credits_pack_gold_balance_non_negative"
      CHECK ("pack_gold_balance" >= 0);
  END IF;
END $$;
