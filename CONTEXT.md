# Project Context

This repo is a production-oriented AI SaaS boilerplate built to launch small AI products with reusable auth, billing, credits, async jobs, storage, and deployment plumbing already in place.

## 1. Stack completo

- **Next.js 16 App Router**: main web framework, routing, API routes, SSR, static pages, and server/client components. Entry points are `app/layout.tsx`, route pages under `app/(marketing)`, `app/(auth)`, `app/(dashboard)`, and API handlers under `app/api`.
- **React 19**: UI rendering. Interactive components are client components such as `components/auth/login-form.tsx`, `components/dashboard/job-create-form.tsx`, and `components/dashboard/dashboard-auto-refresh.tsx`.
- **Tailwind CSS**: styling system. Config lives in `tailwind.config.ts`; global theme tokens and base CSS live in `app/globals.css`.
- **shadcn-style local UI primitives**: lightweight local Button/Input/Textarea/Badge components live in `components/ui/`.
- **Lucide React**: icons used in dashboard, pricing, login, and buttons.
- **Supabase Auth**: magic link and Google OAuth auth provider. Server/browser clients live in `lib/supabase/server.ts`, `lib/supabase/browser.ts`, and auth cookie refresh logic lives in `lib/supabase/middleware.ts`. Route entry points are `app/(auth)/login/page.tsx`, `app/(auth)/callback/route.ts`, `app/(auth)/login/google/route.ts`, and `app/(auth)/logout/route.ts`.
- **Supabase Postgres**: primary database. Drizzle schema is in `lib/db/schema.ts`; migration output is in `drizzle/`.
- **Supabase Storage**: stores generated images/audio in a private bucket. Upload and signed URL helpers live in `lib/ai/storage.ts`; bucket name comes from `SUPABASE_STORAGE_BUCKET` and currently defaults to `ai-results`.
- **Drizzle ORM**: type-safe DB schema and queries. DB client entry point is `lib/db/index.ts`, business queries are in `lib/db/queries.ts`, and CLI config is `drizzle.config.ts`.
- **Upstash Redis REST**: user-level concurrent job rate limiting. Entry point is `lib/redis/rate-limit.ts`.
- **Inngest**: async AI job runner with step isolation. Client is `lib/inngest/client.ts`, function is `lib/inngest/functions.ts`, and public endpoint is `app/api/inngest/route.ts`.
- **fal.ai**: demo image provider using Flux Schnell, headshot training/generation through Flux LoRA, and public temporary uploads through fal.storage. Adapters live in `lib/ai/providers/fal.ts`, `lib/ai/providers/flux-lora-trainer.ts`, and `lib/ai/providers/flux-lora-generator.ts`; upload route is `app/api/upload/route.ts`.
- **OpenAI TTS**: demo text-to-speech provider. Adapter is `lib/ai/providers/openai-tts.ts`.
- **Stripe**: checkout, subscriptions, customer portal, and webhook-driven credit allocation. Client is `lib/stripe/client.ts`, pricing config is `lib/stripe/pricing.ts`, and route handlers are under `app/api/stripe/`.
- **Resend + React Email-style templates**: optional transactional email for welcome, purchase, and job-ready notifications. Templates are in `emails/`; safe send helpers are in `lib/email/send.ts`. Email failures are intentionally non-blocking.
- **Vercel**: deployment target. Production currently runs at `https://ai-project-1-gold.vercel.app`.

## 2. Flujo de un job de AI de punta a punta

1. User opens dashboard at `app/(dashboard)/dashboard/page.tsx`.
   - The page reads the Supabase session with `createSupabaseServerClient()` from `lib/supabase/server.ts`.
   - If no session exists, it redirects to `/login`.
   - If authenticated, it calls `ensureUserProfile()` and `getDashboard()` from `lib/db/queries.ts`.

2. User submits the form in `components/dashboard/job-create-form.tsx`.
   - The form builds a payload:
     - Image: `{ type: "image", input: { prompt } }`
     - TTS: `{ type: "tts", input: { text, voice } }`
   - It sends `POST /api/jobs/create`.

3. Route handler `app/api/jobs/create/route.ts` handles creation.
   - Reads auth with `createSupabaseServerClient()`.
   - Validates payload using `createJobSchema` from `lib/ai/validation.ts`.
   - Calls `ensureUserProfile()` from `lib/db/queries.ts`.
   - Resolves provider and cost with `getAiProvider()` from `lib/ai/providers/index.ts`.
   - Reserves a concurrency slot with `reserveJobSlot()` from `lib/redis/rate-limit.ts`.
   - Calls `createPendingJob()` from `lib/db/queries.ts`, which atomically checks credits, debits credits, inserts a `credit_spend` transaction, and inserts a `jobs` row with `status = pending`.
   - Sends Inngest event `ai/job.created` through `inngest` from `lib/inngest/client.ts`.
   - Returns `{ jobId }` immediately.

4. Inngest receives the event at `app/api/inngest/route.ts`.
   - The registered function is `runAiJob` in `lib/inngest/functions.ts`.

5. Worker `runAiJob` processes the job.
   - Loads the job row from DB.
   - Marks it `processing` via `markJobProcessing()` in `lib/db/queries.ts`.
   - Gets the provider with `getAiProvider(job.type)`.
   - For image jobs, `lib/ai/providers/fal.ts` calls fal.ai Flux and downloads the generated image bytes.
   - For TTS jobs, `lib/ai/providers/openai-tts.ts` calls OpenAI audio speech and returns MP3 bytes.
  - For `headshot-training` jobs, `lib/inngest/functions.ts` creates a user-specific trigger word, stores it in `jobs.metadata`, zips uploaded fal.storage image URLs with JSZip, uploads the ZIP to fal.storage, calls the Flux LoRA trainer, copies the returned `.safetensors` file into Supabase Storage under `loras/{userId}/{jobId}/model.safetensors`, stores `{ lora_url, trigger_word }` in `jobs.result`, marks the job done, and sends a plain readiness email if Resend is configured.
  - For `headshot-generate` jobs, `lib/inngest/functions.ts` calls the Flux LoRA generator with the persisted LoRA URL and trigger word, copies generated images into Supabase Storage under `headshots/{userId}/{jobId}/{index}.jpg`, stores the Supabase URL array in `jobs.result`, marks the job done, and sends a plain readiness email if Resend is configured.
   - Uploads the generated bytes to private Supabase Storage via `storeAiResult()` in `lib/ai/storage.ts`.
   - Marks the DB row `done` and stores the object path in `resultUrl` through `markJobDone()`.
   - Attempts optional `sendJobReadyEmail()` from `lib/email/send.ts`.
   - Releases the Redis active-job slot with `releaseJobSlot()`.

6. Failure path.
   - If provider generation, storage, or another worker step fails, `runAiJob` catches the error.
   - It calls `refundJobCredits()` in `lib/db/queries.ts`.
   - That idempotently refunds credits, inserts a `credit_refund` transaction, and marks the job `failed` with the error message.
   - Redis slot is released in `finally`.

7. User sees the result.
   - `components/dashboard/dashboard-auto-refresh.tsx` calls `router.refresh()` every 2.5 seconds while any job is `pending` or `processing`.
   - `components/dashboard/job-history.tsx` renders each job.
   - Result access goes through `app/api/jobs/result/[id]/route.ts`, which verifies ownership and redirects to a short-lived signed Storage URL.
   - For images, it shows a preview, a `View` link, and a `Download` action.
   - For TTS, it shows an HTML audio player plus view/download actions.

## 3. Mapa de carpetas

- `app/`: Next.js App Router routes.
  - `app/layout.tsx`: root HTML layout and global metadata.
  - `app/globals.css`: global CSS and theme tokens.
  - `app/(marketing)/page.tsx`: public landing page.
  - `app/(marketing)/pricing/page.tsx`: pricing page and checkout forms for credit packs/subscription.
  - `app/(auth)/login/page.tsx`: login page.
  - `app/(auth)/callback/route.ts`: Supabase auth callback that exchanges code for session and creates profile.
  - `app/(auth)/login/google/route.ts`: starts Google OAuth from the server so PKCE verifier is stored in cookies.
  - `app/(auth)/logout/route.ts`: signs out and redirects to login.
  - `app/(dashboard)/dashboard/page.tsx`: protected dashboard.
  - `app/(dashboard)/dashboard/headshots/page.tsx`: protected headshot generation flow.
  - `app/api/jobs/route.ts`: authenticated job listing endpoint. Supports filters such as `type=headshot-generate` and `limit=5`.
  - `app/api/jobs/[id]/route.ts`: authenticated job status endpoint for the current user.
  - `app/api/jobs/[id]/signed-urls/route.ts`: authenticated headshot signed URL endpoint. It normalizes stored Supabase Storage URLs/paths from `jobs.result` and signs them for one hour.
  - `app/api/jobs/create/route.ts`: authenticated job creation endpoint.
  - `app/api/jobs/status/[id]/route.ts`: authenticated job status endpoint.
  - `app/api/jobs/result/[id]/route.ts`: authenticated signed result URL redirect.
  - `app/api/upload/route.ts`: authenticated multipart image upload endpoint. Accepts 5-15 jpg/jpeg/png files in `files`, validates file sizes, uploads each file to fal.storage in parallel, and returns public fal.storage URLs.
  - `app/api/inngest/route.ts`: Inngest webhook/function endpoint.
  - `app/api/stripe/checkout/route.ts`: Stripe Checkout session creation.
  - `app/api/stripe/portal/route.ts`: Stripe customer portal session creation.
  - `app/api/stripe/webhook/route.ts`: Stripe webhook handler.
  - `app/api/health/route.ts`: production health check for env presence and DB connectivity; protected by `HEALTHCHECK_SECRET` in production.
  - `app/robots.ts` and `app/sitemap.ts`: SEO crawler endpoints.

- `components/`: React UI.
  - `components/ui/`: local primitives (`button.tsx`, `input.tsx`, `textarea.tsx`, `badge.tsx`).
  - `components/auth/login-form.tsx`: magic link and Google login controls.
  - `components/dashboard/job-create-form.tsx`: interactive AI job form.
  - `components/dashboard/headshot-flow.tsx`: client-side headshot flow with local photo previews, fal.storage upload, style/count selection, job creation, status polling, signed result gallery, downloads, and previous-session loading.
  - `components/dashboard/job-history.tsx`: table of generated jobs with preview/view/download.
  - `components/dashboard/dashboard-auto-refresh.tsx`: client-side refresh loop for active jobs.

- `lib/`: service clients, domain logic, providers.
  - `lib/db/`: Drizzle schema, DB client, queries, RLS SQL.
  - `lib/supabase/`: server, browser, and proxy/middleware auth helpers.
  - `lib/ai/`: provider interface, validation, storage helper, and provider adapters.
  - `lib/inngest/`: Inngest client and worker function.
  - `lib/redis/`: Upstash rate/concurrency limiter.
  - `lib/stripe/`: Stripe client and pricing metadata.
  - `lib/email/`: Resend client and safe send helpers.
  - `lib/utils.ts`: className merge utility.

- `drizzle/`: generated Drizzle migration files and metadata.
  - `drizzle/0000_black_kang.sql`: initial schema migration.
  - `drizzle/meta/`: Drizzle migration snapshots and journal.

- `emails/`: React email templates.
  - `emails/welcome.tsx`: signup welcome email.
  - `emails/purchase-confirmation.tsx`: credit purchase confirmation.
  - `emails/job-ready.tsx`: job completion email.

- `scripts/`: local operational scripts.
  - `scripts/check-integrations.mjs`: non-destructive integration checks for env/services. It loads `.env.local` and tests DB, Supabase, Redis, Stripe, OpenAI, Resend, and FAL key presence.

## 4. Variables de entorno

From `.env.example`:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL. Used by browser/server Supabase clients.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase publishable/anon key. Used client-side and server-side for auth operations.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key. Used server-side for privileged Storage operations and admin client access.
- `DATABASE_URL`: Postgres connection string for Drizzle. Used in `lib/db/index.ts` and `drizzle.config.ts`. Values are normalized to tolerate accidental wrapping quotes.
- `INNGEST_EVENT_KEY`: event key for sending events to Inngest.
- `INNGEST_SIGNING_KEY`: signing key for the `/api/inngest` endpoint.
- `STRIPE_SECRET_KEY`: Stripe server secret key used by checkout, portal, and webhook handlers.
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret for `app/api/stripe/webhook/route.ts`.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: Stripe publishable key. Present for frontend usage; current checkout implementation is server-side and does not yet use embedded Stripe Elements.
- `STRIPE_PRICE_ID_CREDITS_10`: Stripe Price ID for the 10-credit one-time product.
- `STRIPE_PRICE_ID_CREDITS_50`: Stripe Price ID for the 50-credit one-time product.
- `STRIPE_PRICE_ID_PRO_MONTHLY`: Stripe Price ID for the recurring Pro monthly plan.
- `FAL_KEY`: fal.ai API key for image generation.
- `OPENAI_API_KEY`: OpenAI API key for TTS generation.
- `UPSTASH_REDIS_REST_URL`: Upstash Redis REST URL. Values are normalized to tolerate accidental wrapping quotes.
- `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST token. Values are normalized to tolerate accidental wrapping quotes.
- `RESEND_API_KEY`: Resend API key. Optional operationally; email failures are non-blocking.
- `RESEND_FROM_EMAIL`: sender email for Resend. Must be a verified domain sender in Resend; Gmail addresses are rejected.
- `NEXT_PUBLIC_APP_URL`: canonical public app URL, used by metadata, Stripe success/cancel URLs, sitemap, and robots.
- `HEALTHCHECK_SECRET`: bearer token required by `/api/health` in production.
- `FREE_SIGNUP_CREDITS`: credits granted when a user profile is created for the first time.
- `FREE_MONTHLY_CREDITS`: displayed/used as Free plan monthly credit metadata.
- `PRO_MONTHLY_CREDITS`: credits granted on `invoice.paid` for a Pro subscription.
- `MAX_CONCURRENT_JOBS`: per-user active job concurrency limit enforced through Upstash Redis.
- `SUPABASE_STORAGE_BUCKET`: Supabase Storage bucket for generated files; currently `ai-results`. The bucket should be private.

## 5. Modelo de datos

Schema source: `lib/db/schema.ts`.

- `users`
  - `id`: internal app UUID primary key.
  - `authUserId`: Supabase Auth user id. Unique link to `auth.users`.
  - `email`: user email.
  - `fullName`: optional display name from auth metadata.
  - `stripeCustomerId`: optional Stripe customer id, set during checkout/portal flows.
  - `createdAt`, `updatedAt`: timestamps.

- `credits`
  - `id`: UUID primary key.
  - `userId`: unique FK to `users.id`. One credit balance row per user.
  - `balance`: current credit balance.
  - `updatedAt`: last balance update.

- `subscriptions`
  - `id`: UUID primary key.
  - `userId`: FK to `users.id`.
  - `plan`: plan identifier, currently `free` or `pro`.
  - `status`: Stripe/subscription status or `active` for free.
  - `stripeSubscriptionId`: unique Stripe subscription id.
  - `currentPeriodStart`, `currentPeriodEnd`: Stripe billing period.
  - `cancelAtPeriodEnd`: Stripe cancellation flag.
  - `createdAt`, `updatedAt`: timestamps.

- `jobs`
  - `id`: UUID primary key.
  - `userId`: FK to `users.id`.
  - `type`: enum `image`, `tts`, `headshot-training`, or `headshot-generate`.
  - `status`: enum `pending`, `processing`, `done`, `failed`.
  - `input`: JSON input payload. For image it stores `{ prompt }`; for TTS it stores `{ text, voice }`; for headshot training it stores `{ archive_url, steps }`; for headshot generation it stores `{ lora_url, trigger_word, style, num_images }`.
  - `metadata`: optional JSON metadata for worker-side details. Headshot training stores `{ trigger_word }`.
  - `resultUrl`: private Supabase Storage object path when done. Older rows may contain legacy public URLs; `lib/ai/storage.ts` tolerates both shapes.
  - `result`: optional JSON payload. Headshot jobs store an array of Supabase Storage URLs here.
  - `error`: failure reason when failed.
  - `creditsUsed`: number of credits debited for the job.
  - `completedAt`: timestamp set when a job is marked done.
  - `createdAt`, `updatedAt`: timestamps.

- `transactions`
  - `id`: UUID primary key.
  - `userId`: FK to `users.id`.
  - `type`: enum `credit_purchase`, `subscription_payment`, `credit_spend`, `credit_refund`, `signup_bonus`.
  - `credits`: credit amount added/refunded/recorded. Spends are stored as negative values.
  - `amountCents`: Stripe amount for paid transactions when available.
  - `stripeEventId`: unique idempotency key. Stripe events use the Stripe event id; job refunds use `job_refund:${jobId}`.
  - `metadata`: JSON metadata such as job id, checkout session id, subscription id, source.
  - `createdAt`: timestamp.

Relations:
- `users` has one `credits`.
- `users` has many `jobs`.
- `users` has many `subscriptions`.
- `users` has many `transactions`.

RLS:
- SQL policies live in `lib/db/rls.sql`.
- Users can read only their own rows via Supabase `auth.uid()` mapped through `users.auth_user_id`.
- Server-side writes use service/server credentials and Drizzle.

## 6. Flujo de autenticación

- Login UI: `app/(auth)/login/page.tsx` renders `components/auth/login-form.tsx`.
- Magic link:
  - Client calls `supabase.auth.signInWithOtp()` in `components/auth/login-form.tsx`.
  - Supabase sends the email.
  - The email returns to `app/(auth)/callback/route.ts`.
  - Callback exchanges the `code` with `supabase.auth.exchangeCodeForSession(code)`.
  - Callback creates app profile through `ensureUserProfile()` and redirects to `/dashboard`.

- Google OAuth:
  - Button sends the browser to `/login/google`.
  - `app/(auth)/login/google/route.ts` starts OAuth server-side with Supabase so the PKCE verifier is stored in cookies.
  - Supabase redirects through Google and back to `/callback`.
  - The callback completes the session and profile setup.

- Logout:
  - Dashboard posts to `app/(auth)/logout/route.ts`.
  - It calls `supabase.auth.signOut()` and redirects to `/login` with HTTP 303.

- Session/cookies:
  - Supabase cookies are set with `path: "/"` in server, browser, callback, middleware, and Google login route.
  - `lib/supabase/middleware.ts` refreshes auth cookies through `createServerClient()`.

- Protected routes:
  - `proxy.ts` applies `updateSession()` to:
    - `/dashboard/:path*`
    - `/login`
    - `/api/jobs/:path*`
  - If no user exists and the path starts with `/dashboard`, it redirects to `/login`.
  - API job routes also independently validate auth server-side.

## 7. Sistema de créditos

- Initial credits:
  - `ensureUserProfile()` in `lib/db/queries.ts` creates a profile on first login.
  - It inserts a `credits` row with `FREE_SIGNUP_CREDITS`.
  - It inserts a free `subscriptions` row.
  - It inserts a `signup_bonus` transaction.

- Debit before execution:
  - `app/api/jobs/create/route.ts` calls `createPendingJob()`.
  - `createPendingJob()` runs a DB transaction:
    - Locks/selects the `credits` row with enough balance.
    - Throws `INSUFFICIENT_CREDITS` if balance is too low.
    - Decrements balance.
    - Inserts a `credit_spend` transaction with a negative amount.
    - Inserts `jobs` row with `status = pending`.

- Refund on failure:
  - `runAiJob` in `lib/inngest/functions.ts` catches worker errors.
  - It calls `refundJobCredits(job.id, reason)`.
  - `refundJobCredits()` increments credit balance once, inserts an idempotent `credit_refund` transaction, and marks the job `failed`.

- Stripe credit additions:
  - `app/api/stripe/webhook/route.ts` handles `checkout.session.completed` for one-time credit packs.
  - It calls `addCredits()` in `lib/db/queries.ts`.
  - `addCredits()` inserts the transaction first and only increments balance if the transaction is new.

- Subscription credits:
  - `invoice.paid` webhooks retrieve the subscription and add `PRO_MONTHLY_CREDITS`.
  - Subscription rows are inserted or updated with Stripe period/status data.

- Rate/concurrency:
  - `reserveJobSlot()` and `releaseJobSlot()` live in `lib/redis/rate-limit.ts`.
  - Active count key is `jobs:active:${userId}`.
  - Release deletes the Redis key if the count reaches zero or below to avoid negative counters.
  - Limit is `MAX_CONCURRENT_JOBS`.

## 8. Cómo agregar un nuevo proveedor de AI

1. Add a new job type in `lib/db/schema.ts`.
   - Extend `jobTypeEnum`, for example:
     ```ts
     export const jobTypeEnum = pgEnum("job_type", ["image", "tts", "video"]);
     ```

2. Generate and apply a Drizzle migration.
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

3. Add input typing in `lib/ai/types.ts`.
   - Define the input shape.
   - Extend `AiInput` if needed.
   - Ensure `AiResult` can represent the output. If the new provider returns another file type, extend `extension`.

4. Create a provider adapter in `lib/ai/providers/`.
   - Follow `lib/ai/providers/fal.ts` or `lib/ai/providers/openai-tts.ts`.
   - Implement:
     ```ts
     export const myProvider: AiProvider<MyInput> = {
       type: "video",
       costCredits: 5,
       async generate(input) {
         return {
           bytes,
           contentType,
           extension
         };
       }
     };
     ```

5. Register the provider in `lib/ai/providers/index.ts`.
   - Add it to the `providers` object.

6. Add request validation in `lib/ai/validation.ts`.
   - Extend `createJobSchema` discriminated union with the new `type` and input schema.

7. Update UI in `components/dashboard/job-create-form.tsx`.
   - Add controls for the new job type and build the correct request payload.

8. Update result rendering in `components/dashboard/job-history.tsx`.
   - Render the new output type: image, audio, video, document, etc.

9. Set provider env vars.
   - Add to `.env.example`.
   - Add to Vercel Project Settings.
   - Update `scripts/check-integrations.mjs` if the provider supports a non-destructive check.

10. Test the full path.
   - Create job.
   - Confirm credit debit.
   - Confirm Inngest execution.
   - Confirm Storage upload.
   - Confirm result rendering.
   - Confirm refund behavior on forced failure.

## 9. Estado actual

### Infraestructura base (implementado y verificado)
- Next.js production deploy on Vercel.
- Supabase Auth: magic link y Google OAuth con callback infrastructure.
- Auth-protected dashboard y rutas de API.
- Production health endpoint at `/api/health`, protected by `HEALTHCHECK_SECRET`.
- Supabase Postgres con Drizzle ORM, migraciones aplicadas, RLS SQL aplicado.
- First-login profile creation: credits, suscripción free, y signup_bonus transaction.
- Stripe Checkout, portal, y webhook route para credit purchase, subscription payment, y subscription deletion. Grants idempotentes por stripeEventId.
- Resend email templates (welcome, purchase, job-ready) con errores no-bloqueantes.
- Upstash Redis concurrency reservation: `MAX_CONCURRENT_JOBS=3` permite hasta 3 jobs simultáneos por usuario.
- Inngest async job runner con retries=0 y liberación de slot en finally.
- Job spends como `credit_spend` transactions, refunds idempotentes.

### Flujo de headshots (implementado y testeado end-to-end)

**Upload de fotos:**
- `/api/upload/initiate`: genera pre-signed PUT URL en fal-cdn-v3 por archivo.
- El browser sube directamente a fal.storage (client-side) de forma secuencial (un archivo a la vez para evitar timeouts de 408 que ocurrían con uploads paralelos).
- Compresión client-side antes del upload: Canvas API redimensiona a max 1024px, JPEG 88% de calidad. Reduce fotos de iPhone de 5–15 MB a ~200–500 KB sin pérdida relevante para el trainer.

**Training (Etapa 1) — arquitectura webhook-driven:**
- `POST /api/jobs/create` con `type: "headshot-training"` y `input: { archive_url: JSON.stringify(urls), steps: 1000, name: "nombre del modelo" }`.
- El worker Inngest (`runAiJob`) usa steps para no bloquear Vercel (timeout de 300s en Pro):
  1. `prepare training`: crea trigger word aleatorio (`ohwx` + 4 letras), descarga las imágenes de fal.storage, las comprime en un ZIP con JSZip, y sube el ZIP a fal.storage.
  2. `submit to fal trainer`: llama a `fal.queue.submit()` con `webhookUrl = ${NEXT_PUBLIC_APP_URL}/api/webhooks/fal` y devuelve el `request_id`. No bloquea Vercel.
  3. `store fal request id`: guarda `{ trigger_word, fal_request_id }` en `jobs.metadata`.
  4. `step.waitForEvent("fal/training.${falRequestId}", timeout: "45m")`: suspende el run de Inngest sin mantener ninguna función de Vercel abierta. fal.ai entrena durante ≈8–30 minutos.
  5. fal.ai POST a `/api/webhooks/fal` → el handler envía el evento `fal/training.${request_id}` a Inngest → el run se reactiva.
  6. `store lora`: intenta descargar el `.safetensors` y subirlo a Supabase Storage. Si falla (límite 50 MB del free tier), hace fallback a la URL temporal de fal.storage con un timeout de 8s para no bloquear.
  7. `mark done`: guarda `{ lora_url, trigger_word }` en `jobs.result`.
  8. `send ready email`: envía email de notificación si Resend está configurado.
- El `input.name` del training job es el nombre visible del modelo en la UI.
- **Webhook endpoint**: `app/api/webhooks/fal/route.ts`. Recibe el POST de fal.ai, extrae `request_id`, y envía `inngest.send({ name: "fal/training.${requestId}", data: { status, payload, error } })`. El nombre del evento lleva el `request_id` embebido para evitar expresiones CEL (más confiable en el dev server local).
- **Verificado fal.ai SDK**: el webhook se registra como `fal_webhook` query param en `fal.queue.submit`. El payload de fal.ai usa `status: "OK"` para éxito y `status: "ERROR"` para fallo. El payload contiene `{ diffusers_lora_file: { url }, config_file }` que es exactamente lo que parsea `getFluxLoraUrl()`.

**Generation (Etapa 2):**
- `POST /api/jobs/create` con `type: "headshot-generate"` y `input: { lora_url, trigger_word, style, num_images }`.
- El `lora_url` puede ser una URL directa de fal.storage o un path de Supabase Storage (`loras/...`).
- Si es un path de Supabase, `isSupabaseLoraPath()` lo detecta y `createLoraSignedUrl()` genera una signed URL de 1 hora antes de llamar a fal.ai.
- El worker genera imágenes con `fal-ai/flux-lora`, las copia a Supabase Storage en `headshots/{userId}/{jobId}/{index}.jpg`, y guarda el array de URLs en `jobs.result`.
- `POST /api/jobs/{id}/signed-urls` devuelve signed URLs de 1 hora para la galería.

**UI en `/dashboard/headshots`:**
- **Etapa 1 — "Tus modelos"**: lista de todos los training jobs con `status=done`. Cada modelo muestra su nombre y fecha. Click en un modelo lo selecciona para generación.
- **Training en progreso**: si hay un job `pending`/`processing`, muestra barra de estado con nombre del modelo y tiempo transcurrido. Polling cada 8 segundos.
- **Formulario "Entrenar nuevo modelo"**: se despliega al hacer click. Incluye campo de nombre, drag-and-drop de fotos con preview, compresión y upload secuencial, y botón "Entrenar modelo".
- **Etapa 2 — Generación**: aparece al seleccionar un modelo. Muestra selector de estilo (professional/cinematic/natural) y cantidad (1/2/4 fotos). Botón "Generar mis headshots". Progress in-place mientras genera. Galería con descarga individual y masiva al terminar.
- **Concurrencia**: training y generation corren en paralelo sin bloquearse (hasta `MAX_CONCURRENT_JOBS=3` simultáneos por usuario).

**Scripts de testing:**
- `scripts/seed-training-job.mjs`: inserta un job de training completado directamente en la DB para testing sin correr el trainer real. Intenta copiar el LoRA a Supabase Storage; si falla por límite de tamaño, inserta con la URL de fal.storage.
- `scripts/simulate-fal-webhook.mjs`: simula la finalización de fal.ai disparando el webhook manualmente. Lee el `fal_request_id` de `jobs.metadata` y hace POST a `/api/webhooks/fal`. Usar con `FAL_MOCK_TRAINING=true` para testear el flujo completo sin gastar créditos de fal.ai.

**Variables de entorno locales adicionales (`.env.local` únicamente):**
- `FAL_MOCK_TRAINING=true`: saltea el llamado real a `fal.queue.submit` y devuelve un request_id falso. Usar solo en desarrollo. No subir a Vercel.
- `INNGEST_BASE_URL=http://localhost:8288`: redirige `inngest.send()` al dev server local en vez de Inngest cloud. Necesario cuando se tienen claves de producción en `.env.local` y se quiere testear localmente.

### Limitaciones conocidas
- **Supabase Storage free tier**: límite de 50 MB por archivo. Los `.safetensors` de Flux LoRA portrait pesan ~125 MB y no se pueden almacenar permanentemente en el free tier. El fallback guarda la URL de fal.storage, que es temporal (expira). Los modelos de los usuarios se perderán cuando expire la URL. Solución pendiente: Cloudflare R2 (ver próximos pasos).
- `STRIPE_WEBHOOK_SECRET` debe estar configurado en cada entorno para procesamiento real de webhooks.
- `HEALTHCHECK_SECRET` debe estar en producción si se usa `/api/health`.
- Resend requiere dominio verificado; direcciones `gmail.com` son rechazadas.
- No hay embedded Stripe checkout (flujo actual usa Stripe Checkout externo).
- No hay admin UI.
- Tests automatizados cubren validación de AI, storage helpers, y precios Stripe. Faltan tests de integración de DB, webhooks firmados, y browser smoke tests.
- No hay Supabase Realtime; la UI usa polling/refresh.

## 10. Próximos pasos sugeridos

1. **Integrar Cloudflare R2 para almacenamiento permanente de LoRAs.**
   - R2 es la opción recomendada: 10 GB gratis permanentemente (~80 LoRAs), sin costo de egress (fal.ai descarga de R2 gratis), $0.015/GB/mes después.
   - Plan de integración:
     1. Crear bucket en Cloudflare R2 (dashboard.cloudflare.com → R2).
     2. Instalar `@aws-sdk/client-s3` (R2 es compatible con S3 API).
     3. Agregar en `lib/ai/storage.ts` función `storeLoraFileR2({ userId, jobId, bytes })` que sube a R2 y devuelve la URL pública.
     4. Agregar `createLoraSignedUrlR2(key)` que genera signed URL de 1 hora con `GetObjectCommand`.
     5. Actualizar `storeTrainedLora()` en `lib/inngest/functions.ts` para llamar a R2 en vez de Supabase.
     6. Actualizar `flux-lora-generator.ts` para detectar keys de R2 y generar signed URL antes de llamar a fal.ai.
   - Variables nuevas necesarias: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` (opcional, para URLs públicas).
   - Hasta implementar R2, los LoRAs quedan en fal.storage (temporal). Los modelos de usuarios con URLs expiradas dejarán de funcionar.

2. **Verificación end-to-end en producción.**
   - Correr un training job real con fotos reales. URL de producción: `https://headshots-ai-delta-pink.vercel.app`.
   - Confirmar que fal.ai llama al webhook en `/api/webhooks/fal`.
   - Confirmar que el email de "modelo listo" se envía.
   - Confirmar que la generación de imágenes funciona desde el modelo entrenado.

3. **Finish Stripe end-to-end.**
   - Set `STRIPE_WEBHOOK_SECRET` en Vercel.
   - Correr una compra de prueba y confirmar que los créditos se agregan por webhook.
   - Confirmar idempotencia ante eventos duplicados.

4. **Productize el modelo de precios.**
   - Decidir precio final por training y por generation (créditos).
   - Actualizar `lib/stripe/pricing.ts` y los Price IDs de Stripe.
   - Los precios de test actuales son $1/10cr, $2/50cr, $3/mes Pro.

5. **Mejorar UX de estados de error.**
   - Botón de retry para jobs fallidos.
   - Mensajes de error más amigables (sin exponer detalles técnicos).
   - Indicar claramente cuando el training terminó y el modelo está listo (notificación in-app además del email).

6. **Harden seguridad.**
   - Revisar RLS policies con el modelo de datos final.
   - Agregar rate limits a endpoints de auth y billing si es necesario.
   - Confirmar que el service role key nunca se expone client-side.

7. **Agregar tests.**
   - Unit tests para credit debit/refund en `lib/db/queries.ts`.
   - Integration tests para el route de creación de jobs.
   - Webhook tests con payloads de Stripe firmados.

8. **Productize la UI.**
   - Reemplazar copy genérico por copy del producto.
   - Branding: nombre, logo, colores.
   - Layout responsive para mobile.
   - Página de cuenta/settings.

9. **Operacionalizar el deployment.**
   - Documentar variables de entorno por entorno (dev/prod).
   - Documentar proceso de sync/deploy de Inngest.
   - Agregar monitoring para jobs fallidos y webhook failures.
