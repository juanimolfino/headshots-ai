ALTER TABLE "jobs" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."job_type";--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('image', 'tts', 'headshot-training', 'headshot-generate');--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "type" SET DATA TYPE "public"."job_type" USING (
  CASE
    WHEN "type" = 'headshot' THEN 'headshot-generate'
    ELSE "type"
  END
)::"public"."job_type";
