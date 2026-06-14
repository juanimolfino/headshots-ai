import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Inngest AI job safeguards", () => {
  const source = readFileSync(join(process.cwd(), "lib/inngest/functions.ts"), "utf8");
  const route = readFileSync(join(process.cwd(), "app/api/inngest/route.ts"), "utf8");

  it("wraps headshot generate and edit Fal calls in explicit timeouts", () => {
    expect(source).toContain("HEADSHOT_GENERATE_TIMEOUT_MS");
    expect(source).toContain("HEADSHOT_EDIT_TIMEOUT_MS");
    expect(source).toContain("headshot-generate Fal call");
    expect(source).toContain("headshot-edit Fal call");
    expect(source).toContain("withTimeout(");
  });

  it("registers the stale job reaper as an Inngest cron function", () => {
    expect(source).toContain('id: "reap-stale-ai-jobs"');
    expect(source).toContain('{ cron: "*/10 * * * *" }');
    expect(source).toContain("reapStaleJobs()");
    expect(route).toContain("reapStaleAiJobs");
    expect(route).toContain("functions: [runAiJob, reapStaleAiJobs]");
  });

  it("sends completed job notifications through the JobReadyEmail template helper", () => {
    expect(source).toContain('import { sendJobFailedEmail, sendJobReadyEmail } from "@/lib/email/send"');
    expect(source).toContain("sendJobReadyEmail(user.email");
    expect(source).toContain("/dashboard/headshots");
    expect(source).toContain("Ver modelo");
    expect(source).toContain("Ver resultados");
  });

  it("sends failure/refund email only when a new refund was applied", () => {
    expect(source).toContain('import { sendJobFailedEmail, sendJobReadyEmail } from "@/lib/email/send"');
    expect(source).toContain("getUserFacingJobError(reason)");
    expect(source).toContain("getRefundCopy(job.creditsUsed, job.creditKind)");
    expect(source).toContain('const refunded = await step.run("refund credits"');
    expect(source).toContain("if (refunded) {");
    expect(source).toContain('await step.run("send failure email"');
    expect(source).toContain("sendUserFailureEmail(job, message)");
  });

  it("cleans up training source artifacts and redacts source URLs after success", () => {
    expect(source).toContain("uploadFalStorageFile");
    expect(source).toContain("FAL_SOURCE_OBJECT_EXPIRATION_SECONDS");
    expect(source).toContain("deleteFalRequestPayloadsBestEffort");
    expect(source).toContain('await step.run("cleanup source photos"');
    expect(source).toContain("source_photos_deleted_at");
    expect(source).toContain("archive_url: null");
    expect(source).toContain("updateJobInput");
  });
});
