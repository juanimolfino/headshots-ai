ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "last_stripe_event_id" text;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "last_stripe_event_created_at" timestamp with time zone;
