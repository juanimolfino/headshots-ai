import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Refresh the Supabase session cookie for all routes except:
     * - _next/static / _next/image (static assets)
     * - favicon, robots, sitemap
     * - /api/webhooks/* (per-route auth — fal.ai, Stripe)
     * - /api/inngest (Inngest own signing-key verification)
     * - /api/health (bearer-token protected separately)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|api/webhooks|api/inngest|api/health).*)"
  ]
};
