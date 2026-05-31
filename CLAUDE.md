# headshots-ai — Claude Code context

This is a production AI SaaS for generating professional headshots. Users upload photos, train a personal Flux LoRA model (~8–10 min), then generate headshots from it (~30–60 s). Read `CONTEXT.md` for the full technical reference.

## URLs and services
- **Production**: https://headshots-ai-delta-pink.vercel.app
- **Inngest dashboard**: https://app.inngest.com (production Inngest project)
- **Supabase project**: `pwvbetwddsenumkvudpg` (us-east-1)
- **Cloudflare R2 bucket**: `headshots-ai-bucket-cloudflare` (account `e72cb8cd47e9df76fb435c1721523eb8`)

## Current state (May 2026)
All core features are implemented and verified end-to-end in production:
- Training: webhook-based async with Inngest `step.waitForEvent` — no Vercel timeout
- LoRA storage: Cloudflare R2 (10 GB free, no egress fees, ~125 MB per model)
- Generation: synchronous `fal.subscribe` ~30–60 s, within Vercel Pro 300 s limit
- Email: Resend with `onboarding@resend.dev` sender (verified domain required — Gmail rejected)
- Download: blob-URL approach to bypass cross-origin `<a download>` restriction

## Key files to read first
- `CONTEXT.md` — full architecture, data model, flows, env vars
- `lib/inngest/functions.ts` — the core async job worker
- `app/api/webhooks/fal/route.ts` — fal.ai webhook receiver
- `lib/ai/storage.ts` — R2 + Supabase storage helpers
- `components/dashboard/headshot-flow.tsx` — entire client-side headshot UI

## Critical env vars
All of the following must be set in Vercel for production to work:
```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_PRICE_ID_CREDITS_10, STRIPE_PRICE_ID_CREDITS_50, STRIPE_PRICE_ID_PRO_MONTHLY
FAL_KEY
R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
RESEND_API_KEY, RESEND_FROM_EMAIL=onboarding@resend.dev
NEXT_PUBLIC_APP_URL, HEALTHCHECK_SECRET
FREE_SIGNUP_CREDITS=5, FREE_MONTHLY_CREDITS=5, PRO_MONTHLY_CREDITS=100
MAX_CONCURRENT_JOBS=3, SUPABASE_STORAGE_BUCKET=ai-results
OPENAI_API_KEY
```

## Local-only env vars (never commit to Vercel)
```
FAL_MOCK_TRAINING=true        # skips real fal.ai training, returns fake request_id
INNGEST_BASE_URL=http://localhost:8288  # routes inngest.send() to local dev server
```

## Known open issues
- "Descargar todas" downloads images sequentially (fixed) — verify in production
- Grid may show fewer than 4 images if `signed-urls` API returns fewer — not yet reproduced/confirmed
- Stuck processing jobs must be reset manually via SQL (`UPDATE jobs SET status='failed' WHERE status='processing'`)
- No auto-timeout for jobs stuck in processing state (no watchdog yet)
- Resend sender is `onboarding@resend.dev` (test-only; for production needs a verified domain)

## Local dev setup
```bash
npm install
npm run dev          # Next.js on :3000
npx inngest-cli@latest dev   # Inngest dev server on :8288
```

## Useful scripts
```bash
node scripts/simulate-fal-webhook.mjs <jobId> [loraUrl]   # simulate fal.ai webhook completion
node scripts/check-integrations.mjs                        # verify all service connections
```
