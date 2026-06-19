# headshots-ai

Production AI SaaS for professional headshots. Users upload photos, train a personal Flux LoRA, generate headshots from that LoRA, and can run quick image edits.

Read [CONTEXT.md](./CONTEXT.md) before starting a new chat or implementation session. It contains the current architecture, active AI models, flows, env vars, and known constraints.

## Active AI Models

- `headshot-training`: fal.ai `fal-ai/flux-lora-portrait-trainer`
- `headshot-generate`: fal.ai `fal-ai/flux-lora`
- `headshot-edit`: fal.ai proxy `openai/gpt-image-2/edit` or fal.ai Nano Banana Pro `fal-ai/nano-banana-pro/edit` with direct Gemini fallback
- `tts`: OpenAI `gpt-4o-mini-tts`

`fal-ai/flux/schnell` remains in the repo as a generic `image` provider, but it is not an active product feature in the current UI.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env vars:

```bash
cp .env.example .env.local
```

3. Create/configure Supabase, private storage bucket `ai-results`, Cloudflare R2, Stripe products/prices, Upstash Redis, Inngest, Resend, fal.ai, and OpenAI.

4. Run database migrations:

```bash
npm run db:generate
npm run db:migrate
```

5. Apply [lib/db/rls.sql](./lib/db/rls.sql) in the Supabase SQL editor.

6. Start the app and Inngest dev server:

```bash
npm run dev
npm run inngest
```

## Architecture

Each provider implements `AiProvider` from [lib/ai/types.ts](./lib/ai/types.ts). Providers are registered in [lib/ai/providers/index.ts](./lib/ai/providers/index.ts), job types live in the Drizzle enum, and inputs are validated in [lib/ai/validation.ts](./lib/ai/validation.ts).

The reusable job pipeline is:

`POST /api/jobs/create` validates auth and input, reserves a Redis concurrency slot, debits credits atomically, stores a pending job, sends `ai/job.created` to Inngest, and returns `{ jobId }`. The worker generates the result, uploads it to Supabase Storage, marks the job done, or refunds credits on failure.

LoRA training is webhook-driven because fal.ai training takes longer than Vercel serverless timeouts. Generated images are stored in Supabase Storage; trained LoRA `.safetensors` files are stored in Cloudflare R2.

## Stripe Plans and Prices

Credit pack and plan metadata live in [lib/stripe/pricing.ts](./lib/stripe/pricing.ts). Create matching Stripe Prices and put their IDs in `.env.local`:

```bash
STRIPE_PRICE_ID_SUB_LITE=
STRIPE_PRICE_ID_SUB_PRO=
STRIPE_PRICE_ID_SUB_STUDIO=
STRIPE_PRICE_ID_BLUE_STARTER=
STRIPE_PRICE_ID_BLUE_POPULAR=
STRIPE_PRICE_ID_BLUE_BEST_VALUE=
STRIPE_PRICE_ID_GOLD_SINGLE=
STRIPE_PRICE_ID_GOLD_TRIPLE=
```

Webhook endpoint:

```text
/api/stripe/webhook
```

Handled events are `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed`.

Webhook credit grants are idempotent by `stripeEventId`, so replayed Stripe events do not increment balances twice or reset spent subscription credits. Subscription lifecycle events are also order-protected per Stripe subscription using the last applied event ID and event timestamp.

`invoice.paid` also runs a post-accreditation integrity check for subscriptions: after replacing subscription balances, it verifies the persisted subscription blue/gold balances match the grant metadata on the Stripe price. Mismatches or missing-user attribution raise an operational `reportError()` / Telegram alert without blocking the webhook.

## Job Watchdog And Retention

Inngest registers three functions through `/api/inngest`: `runAiJob`, the cron `reap-stale-ai-jobs`, and the daily cleanup cron `cleanup-expired-ai-jobs`.

- `headshot-generate` and `headshot-edit` fal.ai calls time out after 10 minutes.
- The stale-job reaper runs every 10 minutes.
- Reaper thresholds: generate/edit 15 minutes, training 50 minutes.
- Refunds use the original credit bucket recorded on the job and are idempotent.
- Failed jobs older than 90 days are deleted.
- Done gallery jobs (`headshot-generate`, `headshot-edit`, `tts`) older than 180 days are deleted after their Supabase Storage objects are removed.
- `headshot-training` jobs are preserved because they keep the LoRA reference users still need.

Legacy jobs without `metadata.creditDebits` still refund through the pack fallback, but `refundJobCredits()` emits a structured `console.warn` with code `REFUND_FALLBACK_NO_CREDIT_DEBITS` so those cases are searchable in production logs.

## Security Defaults

- Generated files live in Supabase Storage. Headshot result URLs are normalized and served back to authenticated users as short-lived signed URLs through `/api/jobs/[id]/signed-urls`.
- `/api/health` is protected in production with `HEALTHCHECK_SECRET`; call it with `Authorization: Bearer <secret>`.
- Public auth/session debug endpoints are not part of the template.
- Blue/gold credit debits, purchases, subscription grants, and refunds are recorded in `transactions`.
- Credit balances are protected by database CHECK constraints so subscription and pack blue/gold balances cannot go negative.
- Rotate every secret before creating a new product from this repo.

## Deploy to Vercel

1. Push the repo to GitHub.
2. Import it in Vercel.
3. Add every variable from [.env.example](./.env.example).
4. Configure Supabase auth redirect URLs for your Vercel domain.
5. Configure Stripe webhook signing secret for `https://your-domain.com/api/stripe/webhook`.
6. Set `NEXT_PUBLIC_APP_URL` to the canonical production domain, for example `https://picyourai.com`.
7. Set `HEALTHCHECK_SECRET` in production if you want to use `/api/health`.
8. Deploy.

## Main Routes

- `/` marketing landing page with metadata, sitemap, robots, and JSON-LD.
- `/pricing` public pricing page.
- `/login` Supabase magic link and Google OAuth.
- `/dashboard` protected user dashboard.
- `/api/jobs/create` async job creation.
- `/api/jobs/result/[id]` authenticated signed result URL redirect.
- `/api/jobs/status/[id]` job polling endpoint.
- `/api/inngest` Inngest function endpoint.

## Landing Assets

- Marketing images are served from the root `public/` directory.
- Hero examples: `public/images-landing-page`
- Style examples: `public/examples-images`
- How-it-works step visuals: `public/steps`
- Next.js image optimization is disabled globally on purpose to avoid Vercel `/_next/image` usage and related billing/error noise.
