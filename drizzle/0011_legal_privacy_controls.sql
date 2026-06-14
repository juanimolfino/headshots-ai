ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "accepted_terms_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "accepted_privacy_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "legal_terms_version" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "legal_privacy_version" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "photo_processing_consent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "photo_processing_consent_version" text;
--> statement-breakpoint

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_id_idx" ON "transactions" ("user_id");
