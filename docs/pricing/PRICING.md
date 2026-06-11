# Pricing & Sistema de Créditos

> Documento de decisiones para implementar. Cierra la lógica de costos, créditos,
> suscripciones y packs. Fuente de los costos: dashboards y páginas oficiales de
> Fal y OpenAI (verificadas Jun 2026).

---

## 1. Decisión de proveedor: Fal para TODO

GPT Image 2 cuesta **exactamente lo mismo** en Fal que en OpenAI directo (passthrough, sin markup):

| Concepto       | OpenAI directo | Fal       |
|----------------|----------------|-----------|
| Image input    | $8.00 / 1M tok | $8.00 / 1M |
| Image output   | $30.00 / 1M tok| $30.00 / 1M |
| Text input     | $5.00 / 1M tok | $5.00 / 1M |

Conclusión:
- **OpenAI NO hostea Flux LoRA ni el training.** El core del producto (entrenar un
  modelo del usuario + generar con esa LoRA) es imposible solo con OpenAI.
- Fal unifica training + Flux LoRA + GPT Image 2 en una sola key, un dashboard, una factura.
- **Usar siempre Fal.** Única excepción futura: si conseguimos créditos/descuento de
  OpenAI, usar el modo **BYOK de Fal** (pasar nuestra `openai_api_key`) y seguir con
  el pipeline unificado. No cambia la arquitectura.

---

## 2. Costos reales por operación (USD)

| Operación                     | Endpoint                     | Costo real |
|-------------------------------|------------------------------|------------|
| Training (LoRA, guardada ∞)   | flux-lora-portrait-trainer   | **$2.40**  |
| Generar headshot (768×1024)   | flux-lora                    | **$0.035** |
| Edit LOW (768×1024)           | gpt-image-2/edit             | ~$0.005    |
| Edit MEDIUM (768×1024)        | gpt-image-2/edit             | ~$0.037    |
| Edit HIGH (768×1024, 1 ref)   | gpt-image-2/edit             | ~$0.16     |
| Edit HIGH (768×1024, 4 refs)  | gpt-image-2/edit             | ~$0.22     |

### Restricción crítica del edit (gpt-image-2/edit)
El endpoint cobra **por tokens**, no flat. Cada imagen de referencia se factura, y en
GPT Image 2 el `input_fidelity` está **deshabilitado** → todas las referencias se
cobran a **high fidelity obligatorio** (no se pueden abaratar).

- Cada referencia 768×1024 ≈ ~2,300 tokens × $8/1M ≈ **$0.018 por referencia**.

| Edit HIGH | Output base | Referencias | Total real |
|-----------|-------------|-------------|------------|
| 1 ref     | $0.145      | $0.018      | ~$0.16     |
| 4 refs    | $0.145      | $0.072      | ~$0.22     |
| 10 refs   | $0.145      | $0.180      | ~$0.33     |
| 15 refs   | $0.145      | $0.270      | ~$0.42     |

**REGLA DURA: máximo 4 imágenes de referencia por edit.** Más de 4 dispara el costo
sin mejorar el resultado y rompe el margen.

---

## 3. Restricciones técnicas a aplicar en código

1. **Tamaño de output fijo a `portrait_4_3` (768×1024).** No exponer selección de
   tamaño al usuario (la tabla de precios es no-lineal; 4K high = $0.401, casi 3× el
   costo del formato headshot). El usuario solo elige **calidad**.
2. **Máximo 4 referencias** en cualquier llamada a `gpt-image-2/edit`. Validar y capear
   en backend.
3. Calidad expuesta como 3 niveles con nombre amigable, no como `low/medium/high` crudo:
   - Borrador → `low`
   - Estándar → `medium`
   - Premium HD → `high`

---

## 4. Sistema de DOS créditos: Gold y Blue

La DB separa el color del crédito (Gold/Blue) de su origen contable
(suscripción/pack).

### 🟡 GOLD — solo para TRAINING
- 1 gold = entrenar 1 modelo (LoRA). La LoRA queda guardada para siempre.
- Costo real cubierto: $2.40.
- **No se usa para nada más.** Generación y edición NO consumen gold.

### 🔵 BLUE — para GENERACIÓN y EDICIÓN
- Valor ancla: **1 blue ≈ $0.15 neto** (después de Stripe).
- Consumo según operación (ver tabla §5).

### Bolsas de crédito

La tabla `credits` mantiene 4 bolsas:

| Bolsa | Color | Origen | Vence |
|-------|-------|--------|-------|
| `subscription_blue_balance` | Blue | Suscripción mensual | Sí, al final del período |
| `subscription_gold_balance` | Gold | Suscripción mensual | Sí, al final del período |
| `pack_blue_balance` | Blue | Packs one-time / signup | No |
| `pack_gold_balance` | Gold | Packs one-time / signup | No |

Campos de control:
- `subscription_current_period_end`: fin del período Stripe vigente.
- `subscription_status`: `active`, `past_due`, `canceled` o `none`.

Saldo mostrado al usuario:

```ts
blue = usable(subscription_blue_balance) + pack_blue_balance
gold = usable(subscription_gold_balance) + pack_gold_balance
```

`usable(subscription_*)` solo cuenta si:
- `subscription_status === "active"`
- `subscription_current_period_end` es `null` o mayor/igual a `now()`

### Regla de renovación vs packs

- Suscripción: en cada `invoice.paid`, la bolsa mensual **se reemplaza**, no se suma.
  Ejemplo Pro: `subscription_blue_balance = 70`,
  `subscription_gold_balance = 2`.
- Pack: en cada compra one-time, la bolsa permanente **se suma**.
  Ejemplo Blue Starter: `pack_blue_balance += 30`.
- Los saldos antiguos migrados desde `blue_balance` / `gold_balance` pasan a
  `pack_blue_balance` / `pack_gold_balance` para no vencer créditos existentes.

### Prioridad de consumo

Al crear un job, el gasto descuenta primero de la bolsa de suscripción y después
de pack. Esto preserva los créditos permanentes.

Ejemplo: usuario con 10 blue de suscripción y 30 blue de pack genera 12 imágenes:

```ts
subscription_blue_balance -= 10
pack_blue_balance -= 2
```

Los refunds devuelven a la misma bolsa desde la que se gastó originalmente.

---

## 5. Mapeo operación → créditos BLUE

| Operación (UI)        | Endpoint            | Costo API   | Créditos BLUE | Neto cobrado* | Margen |
|-----------------------|---------------------|-------------|---------------|---------------|--------|
| Generar headshot      | flux-lora           | $0.035/img  | **1 / imagen**| $0.15         | ~4.3×  |
| Edit Borrador (low)   | gpt-image-2 low     | $0.005      | **1**         | $0.15         | ~30×   |
| Edit Estándar (medium)| gpt-image-2 medium  | $0.037      | **2**         | $0.30         | ~8×    |
| Edit Premium HD (high)| gpt-image-2 high    | $0.16–0.22  | **3**         | $0.45         | ~2–2.8×|

\* Neto asumiendo ~$0.15/blue del pack starter (después de Stripe).

> Nota: generar 4 headshots = 4 blue. El edit Premium con el cap de 4 referencias
> tiene piso de margen ~2× — sano.

---

## 6. Modelo de negocio: Suscripción + Packs

**Estrategia de enganche:** la suscripción siempre da el **mejor $/crédito**. Los packs
sueltos cuestan **10–15% más por crédito** que la suscripción equivalente, para empujar
a la gente a suscribirse.

### Suscripciones (mejor $/crédito) — mensual

Cada plan incluye gold (trainings) + blue (generación/edición) que se renuevan cada mes.

| Plan    | Precio/mes | Gold/mes | Blue/mes |
|---------|-----------|----------|----------|
| Lite    | $7.99     | 1        | 30       |
| Pro     | $14.99    | 2        | 70       |
| Studio  | $29.99    | 4        | 160      |

### Verificación de margen por suscripción

Supuestos de costo:
- Stripe: 2.9% + $0.30 por transacción.
- 1 gold consumido = $2.40 (training).
- Blue **peor caso** = todo gastado en edits Premium HD ($0.22 / 3 blue = $0.073 por blue).
- Blue **caso normal** = todo en generación Flux ($0.035 por blue).
- El costo del gold solo se incurre si el usuario realmente entrena; en la práctica
  el training es infrecuente, así que el margen real ≥ "caso normal".

| Plan   | Precio | Neto Stripe | Costo peor caso | Ganancia peor | Costo normal | Ganancia normal |
|--------|--------|-------------|-----------------|---------------|--------------|-----------------|
| Lite   | $7.99  | $7.46       | $4.60           | **+$2.86 (38%)** | $3.45     | **+$4.01 (54%)** |
| Pro    | $14.99 | $14.26      | $9.93           | **+$4.33 (30%)** | $7.25     | **+$7.01 (49%)** |
| Studio | $29.99 | $28.82      | $21.33          | **+$7.49 (26%)** | $15.20    | **+$13.62 (47%)** |

> El piso de margen baja al escalar porque más gold = más costo fijo de training.
> Aun en el peor caso teórico (imposible en la práctica: que usen TODOS los gold y
> quemen TODO el blue en edits HD), las tres suscripciones siguen siendo rentables.

### Packs sueltos (one-time, 10–15% más caros por crédito)

**Blue:**

| Pack        | Precio  | Blue | $/blue  |
|-------------|---------|------|---------|
| Starter     | $4.99   | 30   | $0.166  |
| Popular     | $11.49  | 70   | $0.164  |
| Best value  | $24.99  | 160  | $0.156  |

**Gold:**

| Pack     | Precio  | Gold | $/gold | Margen |
|----------|---------|------|--------|--------|
| Single   | $4.99   | 1    | $4.99  | +$2.15 |
| Triple   | $13.49  | 3    | $4.50  | +$2.10 c/u |

---

## 6.5. Lista completa de productos para Stripe

Modelo Stripe: cada ítem es un **Product** con un **Price**. Suscripciones = price
recurrente mensual. Packs = price one-time (`mode: payment`).

### Suscripciones (recurring, monthly)

| # | Product (nombre Stripe)   | Price   | Recurrencia | Otorga al cobrar/renovar |
|---|---------------------------|---------|-------------|--------------------------|
| 1 | Sub Lite                  | $7.99   | mensual     | +1 gold, +30 blue        |
| 2 | Sub Pro                   | $14.99  | mensual     | +2 gold, +70 blue        |
| 3 | Sub Studio                | $29.99  | mensual     | +4 gold, +160 blue       |

### Packs de Blue (one-time)

| # | Product (nombre Stripe)   | Price   | Otorga   | $/blue  |
|---|---------------------------|---------|----------|---------|
| 4 | Blue Starter              | $4.99   | 30 blue  | $0.166  |
| 5 | Blue Popular              | $11.49  | 70 blue  | $0.164  |
| 6 | Blue Best Value           | $24.99  | 160 blue | $0.156  |

### Packs de Gold (one-time)

| # | Product (nombre Stripe)   | Price   | Otorga   | $/gold  |
|---|---------------------------|---------|----------|---------|
| 7 | Gold Single               | $4.99   | 1 gold   | $4.99   |
| 8 | Gold Triple               | $13.49  | 3 gold   | $4.50   |

**Total: 8 productos** (3 suscripciones + 3 packs blue + 2 packs gold).

### Regla de enganche
Los packs sueltos están a ~$0.156–0.166 por blue. Las suscripciones rinden mejor
$/blue (sumando el gold incluido), así que comprar suelto siempre sale **10–15% más
caro por crédito** → empuja a suscribirse. Mantener esta brecha si se ajustan precios.

### Metadata sugerida por price (para el webhook)
Guardar en `metadata` de cada price para que el webhook acredite sin lógica hardcodeada:
- `grants_gold`: cantidad de gold a acreditar (ej. `"1"`, `"0"`).
- `grants_blue`: cantidad de blue a acreditar (ej. `"30"`).
- `kind`: `"subscription"` | `"pack"`.

### Webhooks Stripe requeridos

| Evento | Comportamiento |
|--------|----------------|
| `checkout.session.completed` | Solo acredita `mode=payment` de packs. Suma a `pack_*`. No acredita suscripciones. |
| `invoice.paid` | Lee `grants_*` de la metadata del Price en los line items de la invoice. Reemplaza `subscription_*`, actualiza `subscription_current_period_end`, marca `subscription_status=active`. Cubre primer pago y renovaciones. |
| `customer.subscription.updated` | Actualiza estado y período. Si `cancel_at_period_end=true`, mantiene `active` hasta `current_period_end`; no borra créditos. Cambios de plan se aplican en el próximo `invoice.paid`. |
| `customer.subscription.deleted` | Marca `subscription_status=canceled` y pone `subscription_blue_balance=0`, `subscription_gold_balance=0`. No toca `pack_*`. |
| `invoice.payment_failed` | Marca `subscription_status=past_due`. No borra créditos; Stripe puede mantener acceso durante el grace period. |

Idempotencia:
- `transactions.stripe_event_id` evita duplicar grants si Stripe reintenta un webhook.
- `invoice.paid` puede reprocesarse sin sumar de más porque reemplaza la bolsa de suscripción.
- Packs usan `checkout.session.completed` con `stripe_event_id` por color de crédito.



- **Nunca cobrar menos de $4.99 por transacción.** En tickets de $1, Stripe se come ~33%.
  Eliminar cualquier pack de $1.
- Tarifa US estándar: **2.9% + $0.30** por transacción. En $4.99 → neto ~$4.55.
- Internacional suma +1.5%; conversión de moneda +1%. Contemplar al fijar precios fuera de US.

---

## 8. Infraestructura (no afecta el pricing por crédito)

- **Cloudflare R2** (storage de LoRAs): ~$0.003–0.008/LoRA/mes. <$10/mes hasta 1,000
  usuarios. Ignorar en el costo por crédito; contabilizar como infra fija.
- Supabase / Upstash / Inngest / Resend: tiers free alcanzan al inicio. Revisar al escalar.

---

## 9. TODO de implementación

- [x] Migrar DB: separar colores y bolsas en `subscription_*` y `pack_*`.
- [x] `lib/stripe/pricing.ts`: reemplazar packs viejos por los de §6. Eliminar packs <$5.
- [x] Webhooks: packs suman; suscripción reemplaza; cancelación limpia solo bolsa de suscripción.
- [ ] Backend: capear referencias a **máx 4** en `gpt-image-2/edit`.
- [ ] Backend: fijar tamaño de output a `portrait_4_3` (768×1024).
- [ ] Cobro por calidad en edit: low=1, medium=2, high=3 blue (ver §5).
- [ ] Training consume **1 gold**, nunca blue.
- [ ] UI: exponer calidad como Borrador / Estándar / Premium HD.
- [ ] Crear los **8 productos/prices** en Stripe (ver §6.5): 3 suscripciones + 3 packs blue + 2 packs gold.
- [ ] Cargar `metadata` por price (`grants_gold`, `grants_blue`, `kind`) para que el webhook no tenga lógica hardcodeada.
- [ ] Webhook Stripe: acreditar blue/gold leyendo la metadata del price; renovar mensualmente en suscripciones.
