CREATE INDEX IF NOT EXISTS "jobs_user_id_created_at_idx"
  ON "jobs" ("user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_active_status_created_at_idx"
  ON "jobs" ("status", "created_at")
  WHERE "status" IN ('pending', 'processing');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_user_id_type_idx"
  ON "jobs" ("user_id", "type");
