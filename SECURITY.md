# Security

This document describes the security model of headshots-ai: what protections are in place, why each one exists, and what still needs manual action.

---

## Authentication & sessions

**Supabase Auth** handles all identity. Every API route calls `supabase.auth.getUser()` — this makes a live request to Supabase to verify the JWT, unlike `getSession()` which only reads the cookie without verifying it server-side.

The `proxy.ts` edge function refreshes the Supabase session cookie on every request and redirects unauthenticated users away from `/dashboard/*`.

All database writes use `SUPABASE_SERVICE_ROLE_KEY` on the server, which bypasses RLS intentionally. The anon key is only used for Auth flows (magic link, OAuth) — never for data access.

---

## Database (Row Level Security)

File: `lib/db/rls.sql`

RLS is enabled on all tables. Policies enforce SELECT access only to the authenticated user's own rows. No INSERT/UPDATE/DELETE policies exist for direct client access — only the service role can write.

**To apply:** run `lib/db/rls.sql` in the Supabase SQL Editor. The file is idempotent (uses `DROP POLICY IF EXISTS` before each `CREATE POLICY`).

Why this matters: if someone obtains the Supabase anon key (it's public in the JS bundle), they still cannot read or write other users' data.

---

## Input validation

File: `lib/ai/validation.ts`

All job creation inputs are validated with Zod before touching the database or calling external APIs:

| Field | Validation |
|---|---|
| `trigger_word` | Regex `^[a-z0-9]{4,20}$` — only what the trainer generates |
| `lora_url` | Must start with `r2:loras/`, `loras/`, or `https://` |
| `archive_url` | JSON array, 10–20 URLs, all HTTPS |
| `background` | Strict enum — no free text |
| `attire` | Strict enum — no free text |
| `attire_color` | Strict enum — prevents prompt injection |
| `steps` | Integer, 500–2000 |
| `num_images` | Integer, 1–4 |

`attire_color` was previously a free string that went directly into the fal.ai prompt — a prompt injection vector. It is now a strict enum.

---

## Rate limiting

File: `lib/redis/rate-limit.ts` (Upstash Redis)

| Limit | Why |
|---|---|
| Max 3 concurrent jobs per user | Prevents resource exhaustion |
| Max 1 training job per user per 5 min | Training costs ~$0.50–$1 each — prevents accidental double-submit and abuse |
| Max 20 upload initiations per user per 2 min | Prevents fal.storage spam |

---

## Webhook security

### fal.ai training webhook (`/api/webhooks/fal`)

**Problem:** fal.ai calls this URL when training completes. Without authentication, anyone who knows the URL can POST a fake completion and inject a malicious LoRA URL — which the Inngest worker would then download and store in R2.

**Solution:** `FAL_WEBHOOK_SECRET` env var. The Inngest worker appends `?secret=<value>` to the webhook URL when submitting to fal.ai. The route verifies the secret using constant-time comparison to prevent timing attacks. If the secret doesn't match, the request is rejected with 401.

**Setup:** `FAL_WEBHOOK_SECRET` must be set in Vercel environment variables. Generate with `openssl rand -hex 32`.

### Stripe webhook (`/api/stripe/webhook`)

Uses `stripe.webhooks.constructEvent()` with `STRIPE_WEBHOOK_SECRET` — standard Stripe signature verification.

### Inngest (`/api/inngest`)

Uses Inngest's built-in `INNGEST_SIGNING_KEY` verification. Excluded from the session-refresh proxy matcher.

---

## HTTP security headers

Configured in `next.config.ts` for all routes:

| Header | Value | Purpose |
|---|---|---|
| `Content-Security-Policy` | See below | Limits script/style/image sources; blocks object injection and clickjacking |
| `X-Frame-Options` | `DENY` | Legacy clickjacking protection |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer data to external sites |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Blocks browser feature access |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Forces HTTPS for 2 years |

### Content Security Policy

```
default-src 'none';
script-src 'self' 'unsafe-inline' https://js.stripe.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://*.supabase.co https://*.fal.media;
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com;
frame-src https://js.stripe.com;
font-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none'
```

`'unsafe-inline'` for `script-src` is required by Next.js App Router (inline hydration scripts). The most valuable directives are `object-src 'none'` (blocks plugin-based XSS), `base-uri 'self'` (prevents base-tag injection), `frame-ancestors 'none'` (clickjacking), and `form-action 'self'` (prevents data theft via form submission).

**Future improvement:** implement nonce-based CSP in `proxy.ts` to eliminate `'unsafe-inline'` from `script-src`.

---

## Logging

The Inngest worker (`lib/inngest/functions.ts`) logs are visible in the Inngest dashboard. Removed all logs that contained:
- Full lists of training photo URLs
- ZIP archive URLs
- R2 keys
- Webhook URL (would expose `FAL_WEBHOOK_SECRET`)
- Raw `job.input` / `job.metadata` JSON

Kept: job IDs, types, counts, status changes, and error messages without payloads.

---

## Pending manual actions

1. **Apply RLS** — run `lib/db/rls.sql` in Supabase SQL Editor if not already done.
2. **Stripe production keys** — swap test keys for live keys before accepting real payments.
3. **Nonce-based CSP** — future improvement to remove `'unsafe-inline'` from `script-src`.
