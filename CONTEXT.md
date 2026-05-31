# Project Context

Production AI SaaS for generating professional headshots. Users upload photos → train a personal Flux LoRA model → generate headshots from it. Built on Next.js, Supabase, Inngest, fal.ai, Stripe, and Cloudflare R2.

---

## 1. Stack

| Layer | Tech | Entry point |
|---|---|---|
| Web framework | Next.js 16 App Router | `app/layout.tsx` |
| UI | React 19 + Tailwind CSS + shadcn-style primitives | `components/ui/` |
| Icons | Lucide React | — |
| Auth | Supabase Auth (magic link + Google OAuth) | `lib/supabase/` |
| Database | Supabase Postgres + Drizzle ORM | `lib/db/` |
| Storage (images) | Supabase Storage (bucket `ai-results`) | `lib/ai/storage.ts` |
| Storage (LoRA models) | **Cloudflare R2** (`headshots-ai-bucket-cloudflare`) | `lib/ai/storage.ts` |
| Async jobs | Inngest | `lib/inngest/` |
| AI training | fal.ai `fal-ai/flux-lora-portrait-trainer` | `lib/ai/providers/flux-lora-trainer.ts` |
| AI generation | fal.ai `fal-ai/flux-lora` | `lib/ai/providers/flux-lora-generator.ts` |
| Payments | Stripe (checkout + subscriptions + webhooks) | `lib/stripe/`, `app/api/stripe/` |
| Email | Resend | `lib/email/send.ts` |
| Rate limiting | Upstash Redis | `lib/redis/rate-limit.ts` |
| Deployment | Vercel Pro | https://headshots-ai-delta-pink.vercel.app |

---

## 2. Headshot flow — punta a punta

### Etapa 1: Upload de fotos

1. User selects photos in `components/dashboard/headshot-flow.tsx`.
2. Client-side compression: Canvas API resizes to max 1024 px, JPEG 88%. Reduces iPhone photos from 5–15 MB to ~200–500 KB.
3. `POST /api/upload/initiate` returns pre-signed PUT URLs for fal.storage.
4. Browser uploads directly to fal.storage sequentially (parallel uploads caused 408 timeouts).
5. fal.storage public URLs are stored client-side and passed to training.

### Etapa 2: Training (async, webhook-driven)

**Why async**: fal.ai Flux LoRA portrait training takes ~8–30 minutes. Vercel Pro serverless timeout is 300 s. Cannot use `fal.subscribe()`.

**Solution**: Inngest `step.waitForEvent` — the Inngest run suspends after submitting to fal.ai, zero Vercel functions held open.

**Steps in `runAiJob` (`lib/inngest/functions.ts`):**

1. `prepare training`
   - Creates random trigger word: `ohwx` + 4 random letters (e.g. `ohwxabcd`)
   - Saves trigger word to `jobs.metadata`
   - Downloads all photos from fal.storage URLs
   - Creates a ZIP with JSZip
   - Uploads ZIP to fal.storage
   - Validates ZIP is publicly accessible

2. `submit to fal trainer`
   - Calls `fal.queue.submit("fal-ai/flux-lora-portrait-trainer", { input, webhookUrl })`
   - `webhookUrl = ${NEXT_PUBLIC_APP_URL}/api/webhooks/fal`
   - Returns `request_id` (does NOT block waiting for result)
   - If `FAL_MOCK_TRAINING=true`: skips real submit, returns fake `mock-{timestamp}-{random}` id

3. `store fal request id`
   - Updates `jobs.metadata` with `{ trigger_word, fal_request_id }`

4. `step.waitForEvent("wait for fal training webhook", { event: "fal/training.{falRequestId}", timeout: "45m" })`
   - Run suspends here. No Vercel function is open. fal.ai trains for 8–30 min.

5. fal.ai calls `POST /api/webhooks/fal` when done
   - Handler (`app/api/webhooks/fal/route.ts`) sends `inngest.send({ name: "fal/training.{requestId}", data: { status, payload, error } })`
   - Event name carries the `request_id` so no CEL filter needed (avoids Inngest dev server CEL bug)
   - Inngest resumes the suspended run

6. `store lora`
   - Downloads `.safetensors` from fal.storage (temp URL, ~125 MB)
   - Uploads to Cloudflare R2 at key `loras/{userId}/{jobId}/model.safetensors`
   - Stores R2 key as `r2:loras/{userId}/{jobId}/model.safetensors` in `jobs.resultUrl`
   - If R2 upload fails: falls back to fal.storage URL (temporary, will expire)
   - Timeout: 120 s for the download

7. `mark done`
   - Stores `{ lora_url: r2Key, trigger_word }` in `jobs.result`

8. `send ready email`
   - Sends plain text email via Resend: "Tu modelo personal está listo"

**fal.ai webhook payload format** (verified from SDK source):
```json
{
  "request_id": "abc123",
  "status": "OK",
  "payload": {
    "diffusers_lora_file": { "url": "https://v3b.fal.media/files/..." },
    "config_file": { "url": "..." }
  }
}
```
Status is `"OK"` for success, `"ERROR"` for failure.

### Etapa 3: Generation (synchronous, ~30–60 s)

1. User selects a trained model and style in the UI.
2. `POST /api/jobs/create` with `type: "headshot-generate"` and `input: { lora_url, trigger_word, style, num_images }`.
3. `lora_url` is the R2 key (`r2:loras/...`).
4. `runAiJob` calls `processHeadshotGenerateJob`:
   - Detects R2 key via `isR2LoraKey()` → calls `createLoraSignedUrlR2()` → 1-hour signed URL
   - Calls `fal.subscribe("fal-ai/flux-lora", { input: { prompt, loras: [{ path: signedUrl }] } })`
   - Waits synchronously (~30–60 s, within Vercel 300 s limit)
5. Downloads generated images from fal.ai CDN URLs.
6. Uploads to Supabase Storage at `headshots/{userId}/{jobId}/{index}.jpg`.
7. Stores public URL array in `jobs.result`.
8. Sends email: "Tus headshots están listos".

### LoRA URL routing logic (`flux-lora-generator.ts`)

```typescript
const loraUrl = isR2LoraKey(input.lora_url)           // starts with "r2:loras/"
  ? await createLoraSignedUrlR2(input.lora_url)         // R2 signed URL (new models)
  : isSupabaseLoraPath(input.lora_url)                  // starts with "loras/"
    ? await createLoraSignedUrl(input.lora_url)          // Supabase signed URL (legacy)
    : input.lora_url;                                    // direct URL (fallback)
```

---

## 3. Cloudflare R2 storage

**Why R2**: Supabase Storage free tier has a 50 MB per-file limit. Flux LoRA `.safetensors` files are ~125 MB. R2 is 10 GB free, no egress fees, S3-compatible API.

**R2 key format**: `r2:loras/{userId}/{jobId}/model.safetensors`
- The `r2:` prefix distinguishes R2 keys from Supabase paths and direct URLs.

**Functions in `lib/ai/storage.ts`:**
- `storeLoraFileR2({ userId, jobId, bytes })` → uploads, returns `r2:loras/...`
- `createLoraSignedUrlR2(r2Key)` → generates 1-hour GET signed URL
- `isR2LoraKey(value)` → checks `value.startsWith("r2:loras/")`

**Important**: R2 signed URLs must be accessed via GET (not HEAD). The signature is method-specific; using HEAD on a GET-signed URL returns 403.

**SDK**: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. R2 endpoint: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.

---

## 4. API routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/jobs/create` | POST | user | Create pending job, debit credits, send Inngest event |
| `/api/jobs` | GET | user | List user jobs (supports `?type=headshot-training&limit=20`) |
| `/api/jobs/[id]` | GET | user | Get job status |
| `/api/jobs/[id]/signed-urls` | POST | user | Get 1-hour signed URLs for generated headshots |
| `/api/jobs/result/[id]` | GET | user | Redirect to signed result URL |
| `/api/upload/initiate` | POST | user | Get pre-signed PUT URLs for fal.storage upload |
| `/api/inngest` | GET/POST | Inngest | Inngest function endpoint |
| `/api/webhooks/fal` | POST | — | Receive fal.ai training completion webhook |
| `/api/stripe/checkout` | POST | user | Create Stripe Checkout session |
| `/api/stripe/portal` | POST | user | Create Stripe Customer Portal session |
| `/api/stripe/webhook` | POST | Stripe sig | Handle Stripe events (credit purchase, subscription) |
| `/api/health` | GET | secret | Production health check |

---

## 5. Database schema (`lib/db/schema.ts`)

### `users`
- `id` UUID PK, `authUserId` (Supabase Auth UID), `email`, `fullName`, `stripeCustomerId`, timestamps

### `credits`
- `id`, `userId` (unique FK), `balance`, `updatedAt`

### `subscriptions`
- `id`, `userId`, `plan` (free|pro), `status`, `stripeSubscriptionId`, period dates, `cancelAtPeriodEnd`, timestamps

### `jobs`
- `id` UUID PK
- `userId` FK
- `type`: `image` | `tts` | `headshot-training` | `headshot-generate`
- `status`: `pending` | `processing` | `done` | `failed`
- `input` jsonb — for headshot-training: `{ archive_url: JSON.stringify(urls), steps, name }`; for headshot-generate: `{ lora_url, trigger_word, style, num_images }`
- `metadata` jsonb — headshot-training stores `{ trigger_word, fal_request_id }`
- `resultUrl` text — first result URL or R2 key
- `result` jsonb — headshot-generate stores `string[]` of Supabase Storage public URLs
- `error` text
- `creditsUsed` int
- `completedAt`, `createdAt`, `updatedAt`

### `transactions`
- `id`, `userId`, `type` (credit_purchase|subscription_payment|credit_spend|credit_refund|signup_bonus), `credits`, `amountCents`, `stripeEventId`, `metadata`, `createdAt`

---

## 6. Environment variables

### Required in production (Vercel)
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Database
DATABASE_URL            # Postgres connection string (with ?pgbouncer=true for pooler)

# Inngest
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY

# Stripe
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_PRICE_ID_CREDITS_10
STRIPE_PRICE_ID_CREDITS_50
STRIPE_PRICE_ID_PRO_MONTHLY

# AI
FAL_KEY
OPENAI_API_KEY

# Cloudflare R2 (LoRA permanent storage)
R2_ACCOUNT_ID
R2_BUCKET_NAME          # headshots-ai-bucket-cloudflare
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY

# Upstash Redis
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN

# Email
RESEND_API_KEY
RESEND_FROM_EMAIL       # Must be a verified domain; use onboarding@resend.dev for testing
                        # Gmail addresses return 403 validation_error from Resend

# App
NEXT_PUBLIC_APP_URL     # https://headshots-ai-delta-pink.vercel.app in production
HEALTHCHECK_SECRET
FREE_SIGNUP_CREDITS=5
FREE_MONTHLY_CREDITS=5
PRO_MONTHLY_CREDITS=100
MAX_CONCURRENT_JOBS=3
SUPABASE_STORAGE_BUCKET=ai-results
```

### Local-only (never add to Vercel)
```
FAL_MOCK_TRAINING=true          # Skip real fal.ai, return fake request_id
INNGEST_BASE_URL=http://localhost:8288  # Route inngest.send() to local dev server
```

---

## 7. UI components (`components/dashboard/headshot-flow.tsx`)

Main client component for `/dashboard/headshots`. All state lives here:

- **Training model list**: polls `GET /api/jobs?type=headshot-training&limit=20` every 8 s while training is active.
- **Active training bar**: shows job name + elapsed timer + dismiss (X) button.
  - Dismiss sets `activeTrainingJob = null` locally; job still runs in the background.
  - If a job is stuck in `processing` for too long: must reset manually in DB (`UPDATE jobs SET status='failed' WHERE status='processing'`).
- **Upload form**: drag-and-drop photos, client-side compression (Canvas → JPEG 88%), sequential upload to fal.storage.
- **Generation form**: style selector (professional / cinematic / natural), count (1/2/4).
- **Generation poll**: polls `GET /api/jobs/{id}` every 8 s while generating; fetches signed URLs on `status=done`.
- **Gallery**: 2-column (sm) / 4-column (lg) grid of generated headshots with individual and bulk download.
- **Download**: fetches blob via `fetch()` then creates local blob URL — required for cross-origin URLs (Supabase storage) where `<a download>` is ignored by browsers. "Download all" runs sequentially to avoid browser popup blocker.

---

## 8. Prompts used for generation

From `lib/ai/providers/flux-lora-generator.ts`:

```typescript
{
  professional: "{trigger_word}, professional headshot, business attire, studio lighting, neutral gray background, sharp focus, photorealistic, 50mm lens",
  cinematic:    "{trigger_word}, cinematic headshot, editorial style, dramatic lighting, high contrast, sharp focus, photorealistic",
  natural:      "{trigger_word}, natural portrait, soft natural lighting, candid professional look, sharp focus, photorealistic"
}
```

fal.ai call params: `image_size: "portrait_4_3"`, `guidance_scale: 3.5`, `num_inference_steps: 28`, `loras: [{ path: signedUrl, scale: 1 }]`.

---

## 9. Credit system

- **Signup**: `FREE_SIGNUP_CREDITS=5` granted on first login via `ensureUserProfile()`.
- **Debit**: `createPendingJob()` atomically checks balance, decrements, and inserts job in a DB transaction.
- **Refund**: on Inngest worker error, `refundJobCredits()` refunds and marks job `failed`.
- **Purchase**: Stripe `checkout.session.completed` webhook → `addCredits()` (idempotent by `stripeEventId`).
- **Subscription**: Stripe `invoice.paid` → add `PRO_MONTHLY_CREDITS=100`.
- **Concurrency**: Upstash Redis key `jobs:active:{userId}`, max `MAX_CONCURRENT_JOBS=3`.

---

## 10. Scripts

```bash
# Verify all service connections (non-destructive)
node scripts/check-integrations.mjs

# Simulate fal.ai webhook to unblock a waiting Inngest run
node scripts/simulate-fal-webhook.mjs <jobId> [loraUrl]
# Reads fal_request_id from jobs.metadata and POSTs to /api/webhooks/fal
```

---

## 11. Local dev

```bash
npm install
npm run dev           # Next.js on :3000
npx inngest-cli@latest dev  # Inngest dev server on :8288 (required for local testing)
```

Stripe CLI for webhooks:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

---

## 12. Known issues and limitations

| Issue | Status |
|---|---|
| Jobs stuck in `processing` don't auto-timeout | No watchdog implemented. Reset manually: `UPDATE jobs SET status='failed' WHERE status='processing'` |
| `RESEND_FROM_EMAIL` must be a verified domain | Use `onboarding@resend.dev` for testing (1 recipient only). Gmail rejected with 403 |
| Supabase storage 50 MB limit | Not an issue for headshots (small JPEGs). Only LoRAs are large; those go to R2 |
| Legacy LoRA URLs | Training jobs from before R2 integration have fal.storage URLs that may have expired. Generation from those models will fail |
| No admin UI | Stuck jobs must be reset via direct DB query |
| No auto-retry for failed jobs | User must create a new job manually |
| No Supabase Realtime | UI uses polling every 8 s |
| `<a download>` cross-origin limitation | Fixed: download uses fetch+blob URL. "Download all" is sequential to avoid browser blocking |

---

## 13. Suggested next steps

1. **Verified Resend domain** — replace `onboarding@resend.dev` with `noreply@yourdomain.com` once user has a domain.
2. **Job watchdog** — cron or Inngest scheduled function that marks jobs stuck in `processing` for >45 min as `failed` and refunds credits.
3. **Retry button** — UI button to resubmit a failed job without losing credits.
4. **Modal navigation** — arrows in the full-screen image modal to navigate between headshots without closing.
5. **Custom domain** — point a real domain to Vercel for production.
6. **Stripe production keys** — currently using test keys. Swap before real users.
7. **Admin UI** — basic table of all users, jobs, and credits for support/debugging.
8. **Auto-cleanup of R2 test objects** — the test upload (`loras/test-user/...`) in R2 can be deleted.
