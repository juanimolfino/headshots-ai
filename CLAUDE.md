# headshots-ai

AI SaaS para generar headshots profesionales. Usuarios suben fotos → entrenan un LoRA personal en fal.ai (async via Inngest, ~8–30 min) → generan headshots desde ese LoRA (~30–60 s, síncrono).

**Leer siempre primero**: `CONTEXT.md` — arquitectura completa, flows, schema, env vars, issues conocidos.

## Archivos clave
- `lib/inngest/functions.ts` — worker async (training + generation)
- `app/api/webhooks/fal/route.ts` — receptor webhook fal.ai
- `lib/ai/storage.ts` — helpers R2 + Supabase
- `components/dashboard/headshot-flow.tsx` — UI completa del flujo

## URLs
- Producción: https://headshots-ai-delta-pink.vercel.app
- Supabase: `pwvbetwddsenumkvudpg` (us-east-1)
- R2 bucket: `headshots-ai-bucket-cloudflare`