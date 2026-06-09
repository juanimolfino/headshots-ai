import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("two-credit balance migration", () => {
  const sql = readFileSync(join(process.cwd(), "drizzle/0007_two_credit_balances.sql"), "utf8");

  it("moves the legacy balance into blue_balance and starts gold_balance at zero", () => {
    expect(sql).toContain('"blue_balance" = COALESCE("blue_balance", "balance", 0)');
    expect(sql).toContain('"gold_balance" = COALESCE("gold_balance", 0)');
    expect(sql).toContain('DROP COLUMN IF EXISTS "balance"');
  });

  it("records credit kind on jobs and transactions", () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "credit_kind" "credit_kind" DEFAULT \'blue\' NOT NULL');
    expect(sql).toContain('CREATE TYPE "credit_kind" AS ENUM (\'blue\', \'gold\')');
  });
});
