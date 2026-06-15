import { NextResponse } from "next/server";
import { getHealthChecks } from "@/lib/health/checks";

export async function GET(request: Request) {
  const configuredSecret = process.env.HEALTHCHECK_SECRET;
  const authorization = request.headers.get("authorization");
  const suppliedSecret = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;

  if (process.env.NODE_ENV === "production" && (!configuredSecret || suppliedSecret !== configuredSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks = await getHealthChecks();
  return NextResponse.json(checks, { status: checks.ok ? 200 : 500 });
}
