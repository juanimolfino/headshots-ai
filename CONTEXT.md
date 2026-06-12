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
| Deploy | Vercel Pro, `https://headshots-ai-delta-pink.vercel.app` |

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
| `POST /api/upload` | Legacy multipart fal.storage upload route |
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

Local-only:

```bash
FAL_MOCK_TRAINING=true
INNGEST_BASE_URL=http://localhost:8288
```

`RESEND_FROM_EMAIL` must be a verified sender/domain. `FAL_WEBHOOK_SECRET` is optional; if present, worker appends it to the fal webhook URL.

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
- Training timeout is 45 minutes; there is no watchdog for jobs stuck in `processing`.
- R2 signed URLs are method-specific; GET-signed URLs fail on HEAD.
- Supabase free tier has a 50 MB per-file limit; LoRAs are about 125 MB, so LoRAs live in R2.
- Legacy LoRA URLs from fal.storage may expire and fail generation.
- UI uses polling every 8 s, not Supabase Realtime.
- No admin UI yet; stuck jobs require direct DB intervention.
- Stripe production keys and a verified Resend domain are still needed before real users.

## Useful Next Work

1. Add a watchdog that fails/refunds jobs stuck in `processing`.
2. Add retry/resubmit for failed jobs.
3. Add admin support UI for users, jobs, credits, and stuck-job recovery.
4. Move Resend to a verified product domain.
5. Swap Stripe to production keys before launch.
