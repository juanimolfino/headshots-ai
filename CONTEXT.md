# Project Context

Production AI SaaS for professional headshots. Users upload photos, train a personal Flux LoRA on fal.ai, then generate or edit headshots. Built with Next.js, Supabase, Inngest, fal.ai, Stripe, Resend, Upstash Redis, and Cloudflare R2.

## Start Here

- Main app route: `app/(dashboard)/dashboard/headshots/page.tsx`
- Main UI: `components/dashboard/headshots-app.tsx`
- Worker: `lib/inngest/functions.ts`
- AI providers: `lib/ai/providers/`
- Job validation: `lib/ai/validation.ts`
- DB schema: `lib/db/schema.ts`
- Storage helpers: `lib/ai/storage.ts`

## Active Product AI Models

| Feature | Job type | Model / endpoint | File |
|---|---|---|---|
| Train personal LoRA | `headshot-training` | fal.ai `fal-ai/flux-lora-portrait-trainer` | `lib/ai/providers/flux-lora-trainer.ts` |
| Generate headshots from LoRA | `headshot-generate` | fal.ai `fal-ai/flux-lora` | `lib/ai/providers/flux-lora-generator.ts` |
| Quick image edit | `headshot-edit` | fal.ai proxy `openai/gpt-image-2/edit` or fal.ai Nano Banana Pro `fal-ai/nano-banana-pro/edit` with direct Gemini fallback | `lib/ai/providers/gpt-image-edit.ts`, `lib/ai/providers/gemini-image-edit.ts` |
| Text to speech | `tts` | OpenAI `gpt-4o-mini-tts` | `lib/ai/providers/openai-tts.ts` |

`fal-ai/flux/schnell` exists as the generic `image` provider in `lib/ai/providers/fal.ts` and is registered in the provider map, but it is not an active product feature in the current UI flow.

## Stack

| Layer | Tech |
|---|---|
| Web | Next.js 16 App Router, React 19 |
| UI | Tailwind CSS, shadcn-style primitives, Lucide React |
| Auth | Supabase Auth, magic link + Google OAuth |
| DB | Supabase Postgres + Drizzle ORM |
| Image storage | Supabase Storage bucket `ai-results` |
| LoRA storage | Cloudflare R2 bucket `headshots-ai-bucket-cloudflare` |
| Jobs | Inngest + Upstash Redis concurrency slots |
| Payments | Stripe checkout, portal, webhooks |
| Email | Resend |
| Deploy | Vercel Pro, `https://picyourai.com` |

## Headshot Flow

1. Upload: UI compresses photos client-side to max 1024 px JPEG 88%, then calls `POST /api/upload/initiate` for fal.storage signed PUT URLs. Uploads run sequentially to avoid 408s.
2. Training: UI creates `headshot-training` with `{ archive_url: JSON.stringify(urls), steps: 1000, name }`.
3. Worker prepares training: downloads fal.storage images, zips them with JSZip, uploads the ZIP to fal.storage, creates trigger word `ohwx` + 4 random letters, and stores it in `jobs.metadata`.
4. Worker submits async training: `fal.queue.submit("fal-ai/flux-lora-portrait-trainer", { input, webhookUrl })`.
5. Worker waits: Inngest `step.waitForEvent` waits for `fal/training.{request_id}` up to 45 minutes. No Vercel function stays open.
6. Webhook: `app/api/webhooks/fal/route.ts` receives fal.ai completion and sends the matching Inngest event.
7. LoRA persistence: worker downloads the `.safetensors` file, uploads it to R2 as `loras/{userId}/{jobId}/model.safetensors`, and stores `r2:loras/{userId}/{jobId}/model.safetensors` in `jobs.resultUrl` and `jobs.result.lora_url`.
8. Generation: UI creates `headshot-generate` with `{ lora_url, trigger_word, style, num_images, background?, attire?, attire_color? }`.
9. Worker signs LoRA URL, calls `fal.subscribe("fal-ai/flux-lora", ...)`, downloads generated URLs, uploads final JPGs to Supabase Storage at `headshots/{userId}/{jobId}/{index}.jpg`, and stores the URL array in `jobs.result`.
10. Quick edit: UI uploads 1-4 original reference images without client compression and creates `headshot-edit` with `{ image_urls, prompt, engine, quality, image_size, num_images }`. Default `image_size` is `auto` to preserve the source aspect ratio; UI also offers `portrait_4_3` and `landscape_16_9`. Worker calls fal.ai `fal-ai/nano-banana-pro/edit` when `engine` is `gemini-3-pro-image`, then falls back to direct Gemini `gemini-3-pro-image` if fal.ai fails; otherwise it calls `openai/gpt-image-2/edit` through fal.ai. Quick edit outputs request PNG and are stored like generated headshots.

## Phase 1 Production Hardening

As of 2026-06-14, Phase 1 is complete and deployed with green production runs:

- Stripe `invoice.paid` replay bug is fixed. `replaceSubscriptionCredits()` only resets subscription balances when the subscription grant transaction was newly inserted. Replayed Stripe event IDs no longer restore spent subscription credits.
- Stripe subscription lifecycle events are order-protected. `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed` flow through `applySubscriptionLifecycleEvent()`, which stores `last_stripe_event_id` and `last_stripe_event_created_at` on `subscriptions` and discards replays or older out-of-order events.
- AI jobs have explicit timeouts and a stale-job reaper. `headshot-generate` and `headshot-edit` wrap fal.ai calls in 10 minute timeouts. The Inngest cron `reap-stale-ai-jobs` runs every 10 minutes and fails/refunds active jobs older than their type threshold.
- Reaper thresholds are intentionally above normal job duration and above the explicit generate/edit timeout: `headshot-generate` 15 minutes, `headshot-edit` 15 minutes, `headshot-training` 50 minutes. Training's webhook wait remains 45 minutes.
- Inngest is registered through `app/api/inngest/route.ts` with `runAiJob`, `reapStaleAiJobs`, and the daily retention cron `cleanupExpiredAiJobs`.

Additional robustness completed on 2026-06-14:

- Legacy jobs without `jobs.metadata.creditDebits` still fall back to refunding `{ bucket: "pack", credits: job.creditsUsed }`, but `refundJobCredits()` now emits a structured `console.warn` with code `REFUND_FALLBACK_NO_CREDIT_DEBITS`. Search production logs for that code to find legacy/accounting fallback cases. The warning includes `jobId`, `userId`, `jobType`, `creditKind`, and `credits`.
- Credit balances are protected by DB CHECK constraints in `drizzle/0010_non_negative_credit_balances.sql`: `subscription_blue_balance`, `subscription_gold_balance`, `pack_blue_balance`, and `pack_gold_balance` must be non-negative.
- Migration `0010_non_negative_credit_balances.sql` preflights existing data and raises an explicit exception if any current balance is negative instead of silently adding constraints over bad data.
- Concurrency coverage lives in `lib/db/create-pending-job-concurrency.test.ts`. It simulates two parallel `createPendingJob()` calls for the same user with balance for only one job, including a split subscription+pack balance case. These tests use an in-memory transactional fake and do not require a real test database.

## Phase 2 UX Reliability

As of 2026-06-14, the dashboard handles job failures and long-running states explicitly:

- Failed `headshot-training`, `headshot-generate`, and `headshot-edit` jobs remain visible in the UI instead of disappearing from filtered histories. Failed states show a human-readable error, explicit refund copy based on `jobs.creditsUsed`/`jobs.creditKind`, and a retry CTA that re-enqueues with the original job input when possible.
- `GET /api/jobs` and `GET /api/jobs/[id]` expose `creditsUsed`, `creditKind`, and `updatedAt` so the client can render refund and status context without guessing.
- The client refreshes credits automatically when polling observes a new `failed` job, using a per-job in-memory guard to avoid repeated refresh loops.
- Training and quick edit now precheck credits before uploads/job creation: training requires gold credits, quick edit requires blue credits based on quality x image count. Generation keeps its existing blue-credit precheck.
- User-facing job error copy is centralized in `lib/job-ux.ts`; it maps provider failures, timeouts, invalid images, insufficient credits, and generic errors away from raw Fal/OpenAI/Gemini/JSON details.
- Long-job feedback uses status-derived stages, ETA-based progress, and last successful poll timestamps. Training copy is normalized around a realistic 4-9 minute expectation; generate/edit use shorter ETA windows and show an over-ETA message instead of pretending progress is still precise.
- Completed training/generate/edit jobs now send the React `JobReadyEmail` template via `sendJobReadyEmail()`, with a direct link back to `/dashboard/headshots`.
- In-app job notifications use the lightweight local toaster in `components/ui/job-toasts.tsx`. Toast events are centralized in `lib/job-toast-events.ts`, deduped by `jobId:eventKind`, and existing historical jobs are primed as already seen on first load so old jobs do not spam users.
- Failed job rows can be hidden with the X/Ocultar action. This is a local UI dismissal stored in `localStorage` per user email; it does not delete the failed job from the database.
- Failed/refunded jobs send the React `JobFailedEmail` template through `sendJobFailedEmail()`. The Inngest worker only sends it when `refundJobCredits()` returns true, so worker retries or duplicate failure handling do not email the same refund twice.

## Phase 3 Legal, Privacy, And Data Handling

As of 2026-06-14, Phase 3A/3B adds concrete privacy controls and final legal-page wiring:

- Final legal document routes exist at `/terms`, `/privacy`, `/cookies`, and `/refund-policy`. They render Markdown from `docs/legal/documentos` through `components/legal/legal-document-page.tsx`.
- Legal placeholders such as `[LEGAL ENTITY NAME]`, `[PRIVACY EMAIL]`, and `[EFFECTIVE DATE]` are centralized in `lib/legal/company-info.ts`.
- Signup/login requires acceptance of Terms, Privacy, Cookie Policy, and Refund Policy. The accepted Terms/Privacy versions and timestamps are stored on `users`.
- Current consent versions are `2026-06-14-v1` for Terms, Privacy, and photo/facial processing consent.
- Training uploads require explicit consent to process photos/facial data for a personal model. `/api/upload/initiate` enforces current legal consent for uploads and current photo-processing consent for `purpose: "training-source"`.
- Fal source uploads and intermediate training ZIPs request a 48-hour CDN expiration via `X-Fal-Object-Lifecycle-Preference`. Fal request payload/output cleanup is attempted best-effort by request id after successful training and on account deletion.
- Successful training redacts source photo URLs from `jobs.input` after the LoRA is stored. The LoRA itself remains in R2 for the life of the account.
- Account deletion is exposed through `/api/account/delete`: external deletions are best-effort, generated images and LoRAs are deleted, Supabase Auth/profile data is deleted, and transactions are anonymized/retained for accounting.
- Generated results are expected to live in a private Supabase Storage bucket and be served only through authenticated signed URL endpoints. New generated results store storage paths rather than public URLs.
- `docs/legal/DATA_INVENTORY.md` remains the technical source inventory behind the published legal documents.

## Phase 4 Observability And Operational Resilience

As of 2026-06-15, Phase 4A/4B adds the critical observability layer without Sentry:

- `reportError()` in `lib/observability/report-error.ts` is the central operational error reporter. It emits structured `console.error` logs, redacts obvious secrets, and sends throttled Telegram alerts for critical incidents.
- Telegram sales notifications remain separate from operational alerts. Error alerts use `sendTelegramErrorAlert()` with the clear `🚨 ALERTA OPERATIVA` prefix and silently no-op when Telegram env vars are missing.
- Alerts are connected for Stripe webhook processing failures, Inngest AI job failures, stale-job reaper refunds, partial account deletion failures, production Fal webhook misconfiguration, and likely provider incidents from Fal/Gemini.
- Alert throttling uses Upstash via `checkRateLimit()` plus an in-process fallback. Default error-alert throttle window is 5 minutes per fingerprint.
- Fal webhooks now prefer official JWKS/ED25519 signature verification via `lib/fal/webhook-verification.ts`, validating `X-Fal-Webhook-Request-Id`, `X-Fal-Webhook-User-Id`, `X-Fal-Webhook-Timestamp`, `X-Fal-Webhook-Signature`, raw-body hash, and timestamp replay leeway.
- `FAL_WEBHOOK_SECRET` remains as a temporary transition fallback appended to the submitted webhook URL. Fallback use logs `FAL_WEBHOOK_LEGACY_SECRET`; remove this fallback after that code is absent from production logs for at least 7 days after the last in-flight training window.
- The old multipart `POST /api/upload` route was unused after the signed upload flow moved to `POST /api/upload/initiate`, and it has been removed.
- Stripe checkout and billing portal session creation are rate-limited per user through Upstash.
- Structured JSON logging is centralized in `lib/observability/logger.ts`. Stripe webhook logs event receipt, credit grant application, idempotent skips, lifecycle changes, missing-user skips, signature rejection, and processing duration.
- `/api/health` now returns integration-level `ok` / `missing` / `error` statuses for Supabase, DB, Stripe, Fal, R2, Inngest, Upstash, Resend, OpenAI, Gemini, Telegram, and app env. It remains protected by `HEALTHCHECK_SECRET` in production.

## Phase 5 Runtime And Landing Updates

As of 2026-06-19, the latest runtime and marketing changes are:

- Runtime canonical URLs now depend on `NEXT_PUBLIC_APP_URL`. Auth redirects, Stripe success/cancel/return URLs, Fal training webhook submission, and job email CTA links all use this env and should resolve to `https://picyourai.com` in production.
- Public SEO/legal URLs still come from `lib/legal/company-info.ts`, which now points `websiteUrl` to `https://picyourai.com/`. That feeds canonical tags, sitemap, robots sitemap URL, `llms.txt`, and OG/Twitter metadata.
- Next.js image optimization is intentionally disabled globally in `next.config.ts` with `images.unoptimized = true` to avoid Vercel `/_next/image` usage, `INVALID_IMAGE_OPTIMIZE_REQUEST` noise, and image optimization billing.
- Public marketing assets must live under the repo root `public/` directory. Landing hero images are served from `public/images-landing-page`, style examples from `public/examples-images`, and how-it-works step visuals from `public/steps`.
- The landing hero, `Three steps to a studio-quality headshot`, and `Choose your look` sections now render real bitmap assets through `next/image` without Vercel optimization.

## Phase 6 Database Hygiene

As of 2026-06-19, DB hygiene adds retention-aware indexing and cleanup:

- Migration `drizzle/0012_jobs_retention_indexes.sql` adds:
  - `jobs_user_id_created_at_idx` on `(user_id, created_at DESC)` for dashboard listings
  - `jobs_active_status_created_at_idx` partial index for `pending` / `processing` jobs used by the reaper
  - `jobs_user_id_type_idx` on `(user_id, type)`
- A new daily Inngest cron `cleanup-expired-ai-jobs` runs at `0 5 * * *`.
- Retention thresholds are defined in `lib/db/queries.ts`:
  - failed jobs older than 90 days are deleted
  - done gallery jobs (`headshot-generate`, `headshot-edit`, `tts`) older than 180 days are deleted after their Supabase Storage objects are removed
- `headshot-training` jobs are never touched by retention cleanup because they preserve LoRA references still needed by the user.
- If storage deletion fails during retention cleanup, the job row is kept for retry on the next cron run, and a structured warning plus throttled operational alert are emitted.

## Phase 7 Subscription Lifecycle UX

As of 2026-06-19, subscription visibility and Stripe attribution are tightened:

- Dashboard settings now include a subscription panel showing the current plan, effective status, next renewal date, and whether the subscription is set to cancel at period end.
- Active subscribers manage billing through the existing Stripe Billing Portal route `POST /api/stripe/portal`; users without an active paid subscription see a CTA back to `/pricing`.
- `GET /api/credits` now returns both balances and the current subscription summary so the client can refresh settings state after polling or billing changes.
- Stripe checkout and billing portal flows now reuse `users.stripeCustomerId` when present and only create a Stripe customer when the user does not already have one. Customer creation/update is centralized in `lib/stripe/customer.ts`.
- `invoice.paid` no longer depends solely on subscription metadata for `userId`. It resolves the user by subscription metadata first, then by `subscriptions.stripeSubscriptionId`, and finally by `users.stripeCustomerId`.
- Telegram billing notifications now distinguish one-time pack purchases from subscription events. New subscription and renewal alerts include the customer label, plan, amount, and the exact blue/gold credits granted in that operation.

## Generation Details

`lib/ai/providers/flux-lora-generator.ts` builds prompts from a style base plus optional background and attire controls. Current styles are `professional`, `cinematic`, and `natural`.

fal.ai Flux LoRA params:

```ts
{
  image_size: "portrait_4_3",
  guidance_scale: 3.5,
  num_inference_steps: 35,
  num_images: input.num_images ?? 4,
  loras: [{ path: loraUrl, scale: 1.0 }]
}
```

LoRA URL routing:

```ts
const loraUrl = isR2LoraKey(input.lora_url)
  ? await createLoraSignedUrlR2(input.lora_url)
  : isSupabaseLoraPath(input.lora_url)
    ? await createLoraSignedUrl(input.lora_url)
    : input.lora_url;
```

## API Routes

| Route | Purpose |
|---|---|
| `POST /api/jobs/create` | Validate input, reserve Redis slot, debit credits, create job, send Inngest event |
| `GET /api/jobs` | List jobs, supports `?type=...&limit=...` |
| `GET /api/jobs/[id]` | Read one job status |
| `POST /api/jobs/[id]/signed-urls` | Normalize stored result URLs/paths and return 1-hour signed URLs for generated or edited headshots |
| `GET /api/jobs/result/[id]` | Authenticated result redirect |
| `POST /api/upload/initiate` | Create fal.storage signed PUT URL |
| `GET/POST /api/inngest` | Inngest endpoint |
| `POST /api/webhooks/fal` | fal.ai training webhook |
| `POST /api/stripe/checkout` | Stripe checkout |
| `POST /api/stripe/portal` | Stripe customer portal |
| `POST /api/stripe/webhook` | Stripe events |
| `GET /api/health` | Production health check, protected by `HEALTHCHECK_SECRET` |

## Database

`jobs.type`: `image` | `tts` | `headshot-training` | `headshot-generate` | `headshot-edit`.

Important job shapes:

- `headshot-training.input`: `{ archive_url, steps, name }`
- `headshot-training.metadata`: `{ trigger_word, fal_request_id }`
- `headshot-training.result`: `{ lora_url, trigger_word }`
- `headshot-generate.input`: `{ lora_url, trigger_word, style, num_images, background?, attire?, attire_color? }`
- `headshot-edit.input`: `{ image_urls, prompt, quality, num_images }`
- `headshot-generate.result` and `headshot-edit.result`: `string[]` of Supabase URLs. `/signed-urls` normalizes URLs/paths and returns 1-hour signed URLs.

Credits are debited atomically in `createPendingJob()` and refunded by `refundJobCredits()` on worker failure. Redis key `jobs:active:{userId}` limits concurrent jobs; default `MAX_CONCURRENT_JOBS=3`.

Refunds are idempotent by `stripeEventId` keys of the shape `job_refund:{jobId}:{bucket}`. The reaper uses the same `refundJobCredits()` path, so a stale job cannot be refunded twice and refunds go back to the original debit bucket recorded in `jobs.metadata.creditDebits`.

Subscription lifecycle ordering requires migration `drizzle/0009_subscription_event_ordering.sql`, which adds `subscriptions.last_stripe_event_id` and `subscriptions.last_stripe_event_created_at`.

Non-negative credit balance constraints require migration `drizzle/0010_non_negative_credit_balances.sql`. If that migration fails with `credits table contains negative balances`, inspect/fix those rows before rerunning it.

Job retention indexes require migration `drizzle/0012_jobs_retention_indexes.sql`.

## Environment

Required production variables:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_PRICE_ID_SUB_LITE
STRIPE_PRICE_ID_SUB_PRO
STRIPE_PRICE_ID_SUB_STUDIO
STRIPE_PRICE_ID_BLUE_STARTER
STRIPE_PRICE_ID_BLUE_POPULAR
STRIPE_PRICE_ID_BLUE_BEST_VALUE
STRIPE_PRICE_ID_GOLD_SINGLE
STRIPE_PRICE_ID_GOLD_TRIPLE
FAL_KEY
FAL_ADMIN_KEY
FAL_WEBHOOK_SECRET
OPENAI_API_KEY
R2_ACCOUNT_ID
R2_BUCKET_NAME
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
RESEND_API_KEY
RESEND_FROM_EMAIL
NEXT_PUBLIC_APP_URL
HEALTHCHECK_SECRET
FREE_SIGNUP_BLUE_CREDITS
FREE_SIGNUP_GOLD_CREDITS
MAX_CONCURRENT_JOBS
SUPABASE_STORAGE_BUCKET
```

Optional observability variables:

```bash
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

Local-only:

```bash
FAL_MOCK_TRAINING=true
INNGEST_BASE_URL=http://localhost:8288
```

`RESEND_FROM_EMAIL` must be a verified sender/domain. `FAL_WEBHOOK_SECRET` is required in production and the worker appends it to the fal webhook URL. `NEXT_PUBLIC_APP_URL` must match the canonical production domain because auth redirects, Stripe return URLs, Fal webhook submission, and job email CTA links all use it. Telegram env vars are optional, but without them operational alerts only remain in logs.

## Local Commands

```bash
npm install
npm run dev
npx inngest-cli@latest dev
npm run build
node scripts/check-integrations.mjs
node scripts/simulate-fal-webhook.mjs <jobId> [loraUrl]
```

## Known Constraints

- Vercel Pro function timeout is 300 s, so LoRA training must stay webhook-driven.
- Training webhook wait timeout is 45 minutes; stale `headshot-training` jobs are reaped after 50 minutes.
- Generate/edit fal.ai calls time out after 10 minutes; the stale-job reaper fails active generate/edit jobs after 15 minutes.
- Failed jobs older than 90 days and done gallery jobs older than 180 days are deleted by the daily retention cron. Training jobs are preserved.
- R2 signed URLs are method-specific; GET-signed URLs fail on HEAD.
- Supabase free tier has a 50 MB per-file limit; LoRAs are about 125 MB, so LoRAs live in R2.
- Legacy LoRA URLs from fal.storage may expire and fail generation.
- UI uses polling every 8 s, not Supabase Realtime.
- No admin UI yet; stuck jobs are auto-reaped/refunded, but manual support still requires DB access.
- Stripe production keys and a verified Resend domain are still needed before real users.

## SEO / GEO Baseline

- Public pages use server-rendered metadata from `lib/seo.ts`, backed by `lib/legal/company-info.ts`.
- Public crawl surfaces include `/`, `/about`, `/pricing`, `/terms`, `/privacy`, `/cookies`, `/refund-policy`, `/robots.txt`, `/sitemap.xml`, and `/llms.txt`.
- AI crawlers are intentionally allowed in `app/robots.ts`; this includes GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and other known AI/search crawlers.
- The OG/Twitter placeholder image is generated by `app/opengraph-image.tsx` and reused by `app/twitter-image.tsx`; replace that file when final brand art is ready.
- Marketing reveal animations are progressive enhancement only. Public copy must remain visible in server-rendered HTML without JavaScript.
- Landing public assets are expected under root `public/`, not `app/public/`.

## Useful Next Work

1. Add admin support UI for users, jobs, credits, and stuck-job recovery.
2. Consider a server-side "archived failed job" flag if hidden failures need to persist across browsers/devices.
3. Move Resend to a verified product domain.
4. Swap Stripe to production keys before launch.
