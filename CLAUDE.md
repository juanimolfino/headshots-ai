# headshots-ai

AI SaaS para generar headshots profesionales. Usuarios suben fotos → entrenan un LoRA personal en fal.ai (async via Inngest, ~8–30 min) → generan headshots desde ese LoRA (~30–60 s, síncrono).

**Leer siempre primero**: `CONTEXT.md` — contexto operativo compacto para continuar en un chat nuevo.

## Modelos activos
- Training LoRA: fal.ai `fal-ai/flux-lora-portrait-trainer`
- Generación headshots: fal.ai `fal-ai/flux-lora`
- Edición rápida: fal.ai proxy `openai/gpt-image-2/edit`
- TTS: OpenAI `gpt-4o-mini-tts`
- Nota: `fal-ai/flux/schnell` está registrado como provider genérico `image`, pero no es feature activa del producto.

## Archivos clave
- `lib/inngest/functions.ts` — worker async (training + generation)
- `app/api/webhooks/fal/route.ts` — receptor webhook fal.ai
- `lib/ai/storage.ts` — helpers R2 + Supabase
- `components/dashboard/headshots-app.tsx` — UI principal del flujo
- `lib/ai/validation.ts` — schemas de jobs y allowlists de inputs
- `lib/ai/providers/index.ts` — registry de providers

## URLs
- Producción: https://headshots-ai-delta-pink.vercel.app
- Supabase: `pwvbetwddsenumkvudpg` (us-east-1)
- R2 bucket: `headshots-ai-bucket-cloudflare`
