# headshotly.pro — Next.js implementation

Production code for the landing page, ported from the HTML design reference.
**Stack:** Next.js 14 App Router · React 18 · TypeScript · Tailwind 3 · `next/font`.

## Run it
```bash
npm install
npm run dev      # http://localhost:3000
```

## File tree
```
code/
├─ app/
│  ├─ fonts.ts          # next/font — Newsreader (serif) + Hanken Grotesk (sans)
│  ├─ globals.css       # design tokens (:root) + all component styles
│  ├─ layout.tsx        # metadata (title/description), font vars, <html class="js">
│  └─ page.tsx          # the page — assembles every section (server component)
├─ components/
│  ├─ Nav.tsx           # "use client" — sticky state + mobile menu
│  ├─ Reveal.tsx        # "use client" — robust scroll fade/rise wrapper
│  ├─ Faq.tsx           # "use client" — single-open <details> accordion
│  ├─ Placeholder.tsx   # labeled striped image slot (swap for next/image)
│  ├─ StructuredData.tsx# FAQPage + Product JSON-LD
│  ├─ Logo.tsx, icons.tsx
├─ lib/content.ts       # ALL copy + image alt text (single source of truth)
├─ tailwind.config.ts   # exposes the tokens as Tailwind theme (bg-surface, font-serif…)
├─ tsconfig.json        # @/* path alias → project root
├─ postcss.config.js · package.json
```

## How it maps to the design
- **Tokens:** every color/spacing/radius value lives in `:root` in `globals.css`
  and is mirrored into `tailwind.config.ts`, so the rest of your app can use
  `bg-surface text-ink border-line font-serif` etc.
- **Fonts:** loaded with `next/font/google` (no render-blocking CDN). The CSS
  vars `--font-serif` / `--font-sans` feed both the plain CSS and Tailwind.
- **Server vs client:** the page and all content are server-rendered (good for
  SEO / above-the-fold). Only `Nav`, `Reveal`, and `Faq` are client components.
- **Motion:** `Reveal` adds a gentle fade+rise once an element scrolls in, with
  an above-the-fold immediate pass and a timeout safety net, and is disabled
  under `prefers-reduced-motion`.

## Swapping in real photos
Every image is a `<Placeholder label=… alt=… />` (gray striped slot). Replace
each with `next/image`, carrying the `alt` text across — see the comment block
at the top of `components/Placeholder.tsx`. Slots: 4 hero shots, 3 how-it-works
illustrations, 3 style portraits.

## SEO included
- `metadata` export in `layout.tsx` (title + description, verbatim from the brief).
- Single `<h1>` (hero), `<h2>` per section, `<h3>` on plan names + FAQ questions.
- Descriptive `alt` on every image (from `lib/content.ts`).
- **JSON-LD**: `FAQPage` + `Product` (two offers) via `StructuredData.tsx`.
- Semantic `nav` / `main` / `section` / `article` / `footer`; section IDs
  `#how-it-works`, `#styles`, `#pricing`, `#faq`.

## Adopting this across the rest of the app
1. Keep `globals.css` `:root` + `tailwind.config.ts` as your shared token layer.
2. Lift the primitives (`.btn`, `.ph`, `.eyebrow`, card/plan styles) into reusable
   components or shadcn equivalents (Button variants, Card, Accordion, Badge).
3. Build new pages with the Tailwind token classes so everything stays consistent.

> Optional: if you prefer shadcn/ui primitives, the parent `README.md` has the
> component-mapping table (Button / Card / Accordion / Badge).
