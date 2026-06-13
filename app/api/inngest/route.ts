import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { reapStaleAiJobs, runAiJob } from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runAiJob, reapStaleAiJobs],
  signingKey: process.env.INNGEST_SIGNING_KEY
});
