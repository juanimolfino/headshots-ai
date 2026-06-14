# Data Inventory

Estado: implementacion tecnica actual. Este documento es materia prima para redactar textos legales finales; no es una politica legal definitiva.

## Datos Personales Guardados

| Dato | Donde se guarda | Retencion actual |
|---|---|---|
| Email | Supabase Auth y `users.email` en Postgres | Vida de la cuenta; se elimina al borrar cuenta. |
| Nombre/perfil OAuth | `users.full_name` cuando Supabase lo devuelve | Vida de la cuenta; se elimina al borrar cuenta. |
| Stripe customer ID | `users.stripe_customer_id` | Vida de la cuenta; se intenta borrar/anular en Stripe al borrar cuenta. |
| Consentimiento legal | `users.accepted_terms_at`, `accepted_privacy_at`, versiones | Vida de la cuenta; se elimina con la cuenta. |
| Consentimiento de procesamiento de fotos/datos faciales | `users.photo_processing_consent_at`, version | Vida de la cuenta; se elimina con la cuenta. |
| Fotos fuente/selfies | Fal CDN via signed upload | Expiracion corta solicitada por header: 48 horas. Se usan para crear el ZIP de training. Tras training exitoso se eliminan los URLs del `jobs.input`; el borrado de archivos input en Fal depende del TTL porque la Platform API solo garantiza borrado de payloads/output. |
| ZIP intermedio de training | Fal CDN | Expiracion corta solicitada por header: 48 horas. Se usa como input del trainer. |
| LoRA entrenada | Cloudflare R2 `loras/{userId}/{jobId}/model.safetensors` | Mientras exista la cuenta y haya consentimiento explicito. Se borra al borrar cuenta. |
| Imagenes generadas/editadas | Supabase Storage bucket `ai-results`, paths `headshots/{userId}/{jobId}/...` | Mientras exista la cuenta. Se borran al borrar cuenta o, para quick edit, al borrar ese resultado. |
| Jobs y prompts | Postgres `jobs.input`, `jobs.metadata`, `jobs.result`, `jobs.error` | Vida de la cuenta. Para training exitoso, los URLs de fotos fuente se redactan de `jobs.input` despues de completar. |
| Creditos y balances | Postgres `credits`, `subscriptions` | Vida de la cuenta; se borran con la cuenta. |
| Transacciones | Postgres `transactions` | Se conservan para contabilidad/impuestos, pero al borrar cuenta se desvinculan del usuario (`user_id = null`) y se marca metadata de anonimizacion. |

## Terceros

| Tercero | Datos enviados/recibidos |
|---|---|
| Supabase | Auth, email, DB de perfiles/jobs/creditos, Storage de imagenes generadas. |
| Cloudflare R2 | Archivos LoRA entrenados por usuario. |
| Fal | Fotos fuente, ZIP de training, request de entrenamiento, LoRA output temporal, generacion Flux, quick edit via endpoints Fal, URLs temporales de outputs. Se usa header de expiracion de 48h y se intenta borrar payload/output por request id. |
| OpenAI via Fal | En quick edit con GPT Image 2, Fal recibe prompt e imagenes de referencia y llama al proveedor. |
| Google Gemini | En fallback directo Nano Banana Pro, el sistema descarga las imagenes de referencia y las manda como inline base64 junto con el prompt. |
| Stripe | Email, customer, checkout, suscripciones, pagos, metadata interna de usuario/plan/pack y versiones legales aceptadas antes de checkout. |
| Resend | Email y contenido de emails transaccionales: bienvenida, compra, job listo, fallo/reembolso. |
| Upstash Redis | Rate limit/concurrencia por user id interno. |
| Inngest | Orquestacion de jobs: job ids, eventos, estados, request ids necesarios para workflow. |
| Telegram | Solo si esta configurado: nombre/email del cliente, tipo de compra, monto, plan/pack, creditos. |

## Consentimiento Implementado

- Signup/login requiere checkbox de Terminos y Politica de Privacidad para magic link y Google OAuth.
- El callback de auth guarda fecha/version de Terminos y Privacidad en `users`.
- Antes de subir fotos para entrenar un modelo, la UI exige checkbox adicional para procesar fotos/datos faciales y registra el consentimiento.
- El endpoint `/api/upload/initiate` rechaza uploads sin consentimiento legal vigente; para `purpose: "training-source"` tambien exige consentimiento de procesamiento facial vigente.

## Borrado Implementado

- Quick edits pueden borrarse individualmente: se eliminan imagenes de Supabase Storage y el row del job.
- `/api/account/delete` ejecuta borrado de cuenta:
  - cancela suscripciones Stripe activas best-effort;
  - intenta borrar el Stripe customer;
  - borra LoRAs en R2;
  - borra imagenes generadas en Supabase Storage;
  - intenta borrar payloads/output en Fal por request id;
  - anonimiza transacciones y las conserva;
  - borra profile DB y Supabase Auth user.

## Bucket De Resultados

- Los resultados se sirven por endpoints autenticados que generan signed URLs de 1 hora.
- Nuevos resultados guardan paths de storage, no public URLs.
- El bucket `ai-results` debe estar privado. Si se encuentra publico, hay que pasarlo a privado; el acceso de usuario debe seguir pasando por `/api/jobs/[id]/signed-urls`.
