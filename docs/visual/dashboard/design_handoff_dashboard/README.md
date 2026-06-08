# Handoff: headshotly.pro — Dashboard (`/dashboard`)

## Overview
Redesign of the authenticated **`/dashboard`** screen (the "New generation" + history
view). It keeps the existing layout idea — a left sidebar with room to grow + a main
work area — but rebuilds it on the **headshotly.pro design system**: warm off-white
content, a **deep-navy sidebar**, and a **new sage-green accent** that drives selection,
the primary CTA and focus. Energy is deliberately *medium*: blue and gold appear only
where they carry meaning (credits, cost, status).

This package is the visual source of truth for that screen. Rebuild it idiomatically in
the real stack (**Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui**) — match the
look pixel-for-pixel, structure it your way.

**Files**
- `Dashboard.html` — high-fidelity **static** reference. Open it in a browser to see the
  exact look, spacing and the background-generation state.
- `dashboard.css` — the styles to add: **new tokens** + the `.dsh-*` component classes.
  Built on top of the tokens already in `globals.css` (`--bg`, `--surface`, `--ink`,
  `--navy`, `--blue`, `--gold`, …).
- `README.md` — this file.

> ⚠️ **Touch `/dashboard` behind a plan + diff** as agreed. This is the visual + token
> spec; wire data/handlers in your components, don't lift the static HTML verbatim.

---

## What changed vs. the current screen
| Area | Before | After |
|---|---|---|
| Sidebar | Flat black, generic | **Deep-navy** brand surface; model rows with avatar + **live status** (Ready / Training spinner); a `Tools` group with reserved slots (Quick edit, Gallery) |
| Credits | One number ("Credits 46") | **Two credit types** with colored dots — Blue (generate) + Golden (train) — in a footer panel + `Buy credits` |
| Style picker | Black "selected" block | Cards with **sage border + wash + check**; clear hover |
| Background / Attire | Black pills | Pill **chips**, active = sage |
| Count | Tabs | **Segmented control** + live cost line (`• 4 blue credits`) |
| Primary CTA | Black button | **Sage** `Generate headshots` (the lively moment) |
| History | Plain text list | **Rich rows**: thumbnail (2×2 grid for multi), metadata, status badge, download / view |
| Waiting | — | **Background generation**: a persistent top pill + a running row with progress, "Runs in background — keep working" |

---

## Design tokens (added)
All of these are in `dashboard.css`. Add them to your `:root` (and expose via
`tailwind.config` like the existing colors so you can use `bg-sage`, `text-sage`, etc.).

| Token | Hex | Use |
|---|---|---|
| `--navy-deep` | `#151c33` | Sidebar surface (a touch deeper than `--navy`) |
| `--sage` | `#5f7152` | **Dashboard accent** — primary CTA, selection, focus |
| `--sage-deep` | `#4d5d42` | Accent hover |
| `--sage-tint` | `#ebeee4` | Accent wash — selected style card, running row |
| `--sage-line` | `#cdd7c0` | Accent hairline |
| `--sage-side` | `#a4b58c` | Accent that reads on the dark sidebar (active model, brand mark) |
| `--ready` | `#46a274` | Status green (model ready / done) |
| `--ready-bg` / `--ready-line` | `#e8f0ea` / `#cfe3d6` | Ready badge fill / border |

Reused from the landing system: `--blue` (#3f6dd6, "blue credits"),
`--gold` (#c79a3e, "golden credits"), `--navy`, `--surface`, `--bg`, `--bg-2`, `--ink*`,
`--line*`, **Hanken Grotesk** (`--sans`).

**Type:** the dashboard uses **only Hanken Grotesk** (no serif) — it should feel app-like.
Weights 600/700 for labels and titles, 400/500 for meta.

### Themeable accent
The components consume a generic accent (`--ac`, `--ac-deep`, `--ac-tint`, `--ac-line`,
`--ac-on`, `--ac-side`) which `.dsh` maps to the sage tokens. Swapping the whole screen to
another direction (we also explored **terracotta**) is a one-block override — see the
commented `.dsh.theme-terra { … }` in `dashboard.css`. Keep this indirection if you ever
want per-user themes; otherwise inline sage directly.

---

## Layout
- **Two columns:** `aside.dsh-side` (266px, sticky, full-height) + `main.dsh-main` (fluid).
- **Sticky top bar** (`.dsh-top`, 68px): page title = active model name + status chip on the
  left; the **background-task pill** on the right.
- **Content** (`.dsh-scroll`): max-width **1180px**, padding 26–30px, 24px gap between the
  generation card and the results list.
- Radii: cards `18px`, inner controls `11–13px`, pills/chips `999px`.
- Shadows: faint ambient only (`0 22px 48px -38px rgba(28,26,23,.5)` on the card). No
  gradients except the thumbnail shimmer highlight.
- **Responsive (<860px):** sidebar becomes an off-canvas drawer (`.dsh-side.open`); style
  cards and the two chip columns stack; the gen bar goes vertical. Add a hamburger in the
  top bar to toggle the drawer.

---

## Component → shadcn/ui mapping
| Design element | shadcn primitive | Notes |
|---|---|---|
| Style cards | `RadioGroup` + custom `RadioGroupItem` cards | `aria-checked`; active = `.is-active` (sage border + `--sage-tint`, check fades in). |
| Background / Attire | Toggle group of `Button` chips, or `ToggleGroup` | Single-select; active = sage fill. |
| Count | `ToggleGroup` (segmented) | Active thumb = `--surface` + soft shadow. |
| `Generate headshots` | `Button` | New `sage` variant: `bg-sage text-white hover:bg-sage-deep`. |
| `Buy credits`, `New model` | `Button` (`secondary` / dashed `outline`) | — |
| Status / Ready / Generating | `Badge` | Green `done`; sage `running` (with spinner). |
| Model rows, Tools | nav buttons / `Link` | Active model = sage wash + 3px left bar. |
| Sign out, download | `Button` `size="icon"` `variant="ghost"` | — |
| Top task pill, running row | custom + `Progress` | See **States** below. |

Map `.dsh-thumb` placeholders to `next/image` once real headshots exist (multi-photo runs
show a 2×2 grid; single = one image). Carry `aria-label` → `alt`.

---

## States & behavior
**Generation runs in the background — the user can keep using the app.** Model this as
async job state, surfaced in two places:

1. **Top pill** (`.dsh-task`, `role="status"`) — always visible while any job is active:
   spinner + `Generating · N photos · NN%` + a thin progress bar. Persist across navigation
   (it's account-level, not page-level).
2. **Running row** at the top of *Recent* (`.dsh-item.is-running`): sage-tinted, a
   `Progress` bar, badge `Generating NN%`, helper "Runs in background — keep working".
   On completion it animates into a normal **Ready** row with thumbnails.

Other states to build (same vocabulary):
- **Model training** — shown inline in the sidebar (`sofia` row: spinner + "~6 min left").
  Same background-job pattern; the model is selectable but generation is disabled until ready.
- **Empty** (no models yet) — center the work area on a single "Train your first model" CTA.
- **No credits** — disable `Generate`, swap the cost line for a soft upsell linking to
  `Buy credits` (don't hard-block the UI).

State shape (all client/UI + your job API): `selectedStyle`, `background`, `attire`,
`count`, plus polled/streamed `jobs[]` (`{id, status, progress, style, count}`) and
`credits {blue, gold}`.

**Motion:** spinners + a 1.6s thumbnail shimmer; everything is gated behind
`prefers-reduced-motion: reduce`. No decorative looping on content.

---

## Accessibility
- One `h1` per screen = the model name in the top bar.
- Style picker and Count are radio groups (`role="radiogroup"` / `aria-checked`); chips are
  toggle buttons. Ensure visible keyboard focus (use a sage focus ring).
- Status uses `role="status"` so progress is announced; never rely on the green dot alone —
  it's always paired with a text label ("Model ready", "Ready", "Generating").
- Icon-only buttons (download, sign out) have `aria-label`s.

---

## Integration steps
1. Add the **new tokens** to `:root` in `globals.css`; mirror `sage`, `navy-deep`, `ready`
   in `tailwind.config.ts` (next to the existing `blue` / `gold`).
2. Add a **`sage` Button variant** to your shadcn `Button`.
3. Paste the `.dsh-*` rules from `dashboard.css` (or translate the salient ones into
   Tailwind classes / `@apply`). Keep the `--ac` indirection if you want themeability.
4. Build the screen from the reference: `Sidebar`, `TopBar` (+ `TaskPill`),
   `GenerationCard` (Style / Background / Attire / Count / Generate), `RecentList`
   (`GenerationRow` with `running` + `done` variants).
5. Wire the **job/credits** state; make the top pill account-level so it survives route
   changes.
