import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("legacy upload endpoint", () => {
  it("keeps the old multipart /api/upload endpoint removed", () => {
    expect(existsSync(join(process.cwd(), "app/api/upload/route.ts"))).toBe(false);

    const dashboardSource = readFileSync(join(process.cwd(), "components/dashboard/headshots-app.tsx"), "utf8");
    const flowSource = readFileSync(join(process.cwd(), "components/dashboard/headshot-flow.tsx"), "utf8");

    expect(dashboardSource).toContain('"/api/upload/initiate"');
    expect(flowSource).toContain('"/api/upload/initiate"');
    expect(dashboardSource).not.toContain('"/api/upload"');
    expect(flowSource).not.toContain('"/api/upload"');
  });
});
