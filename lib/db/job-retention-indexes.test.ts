import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("job retention indexes", () => {
  it("adds dashboard and reaper indexes safely through migration and schema", () => {
    const migration = read("drizzle/0012_jobs_retention_indexes.sql");
    const schema = read("lib/db/schema.ts");

    expect(migration).toContain('CREATE INDEX IF NOT EXISTS "jobs_user_id_created_at_idx"');
    expect(migration).toContain('ON "jobs" ("user_id", "created_at" DESC)');
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS "jobs_active_status_created_at_idx"');
    expect(migration).toContain("WHERE \"status\" IN ('pending', 'processing')");
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS "jobs_user_id_type_idx"');
    expect(schema).toContain('index("jobs_user_id_created_at_idx")');
    expect(schema).toContain('index("jobs_active_status_created_at_idx")');
    expect(schema).toContain('index("jobs_user_id_type_idx")');
  });
});
