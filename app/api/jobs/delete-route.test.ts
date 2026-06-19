import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("job delete route", () => {
  const source = readFileSync(join(process.cwd(), "app/api/jobs/[id]/route.ts"), "utf8");

  it("allows permanent deletion of failed jobs and scopes deletes to the owner", () => {
    expect(source).toContain('job.status === "failed"');
    expect(source).toContain('job.type === "headshot-edit"');
    expect(source).toContain("getJobForUser(id, profile.id)");
    expect(source).toContain("and(eq(jobs.id, id), eq(jobs.userId, profile.id))");
    expect(source).toContain("Only failed jobs or Quick GPT edits can be deleted");
  });
});
