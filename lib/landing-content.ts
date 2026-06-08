// =========================================================
// Landing copy (single source of truth) — adaptado del brief de diseño.
// La copy es final. Marca = "Headshots AI".
// Email de contacto: juanimolfinooo@gmail.com (placeholder; cambiar por el oficial más adelante)
// =========================================================

export const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#styles", label: "Styles" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export const STEPS = [
  {
    num: "Step 01",
    title: "Upload 10–20 selfies",
    body: "Any lighting, any angle. Just be yourself — variety helps the model learn your face.",
    label: "upload · selfies",
    alt: "Illustration of a grid of casual selfies being uploaded",
  },
  {
    num: "Step 02",
    title: "We train your personal AI model",
    body: "Your own model, ready in about ten minutes. We'll email you the moment it's done.",
    label: "train · ~10 min",
    alt: "Illustration of an AI model training progress indicator",
  },
  {
    num: "Step 03",
    title: "Generate headshots in any style",
    body: "Pick a look, generate as many as you like, and download in high resolution.",
    label: "generate · hi-res",
    alt: "Illustration of finished high-resolution headshots ready to download",
  },
];

export const STYLES = [
  {
    tag: "01 — Professional",
    title: "Professional",
    body: "Business attire, neutral background, sharp focus.",
    label: "professional",
    alt: "Professional style headshot sample: business attire, neutral background, sharp focus",
  },
  {
    tag: "02 — Cinematic",
    title: "Cinematic",
    body: "Dramatic lighting, editorial feel, high contrast.",
    label: "cinematic",
    alt: "Cinematic style headshot sample: dramatic lighting, editorial feel, high contrast",
  },
  {
    tag: "03 — Natural",
    title: "Natural",
    body: "Soft light, candid, approachable.",
    label: "natural",
    alt: "Natural style headshot sample: soft light, candid, approachable",
  },
];

export const WHY = [
  {
    title: "Cost",
    body: "A fraction of a studio session. No travel, no booking.",
    icon: "cost",
  },
  { title: "Speed", body: "Ready in minutes, not weeks.", icon: "speed" },
  {
    title: "Variety",
    body: "Dozens of looks from a single upload.",
    icon: "variety",
  },
  {
    title: "Comfort",
    body: "No awkward poses or strangers pointing cameras at you.",
    icon: "comfort",
  },
] as const;

export const HERO_SHOTS = [
  {
    label: "professional · f",
    alt: "Sample AI headshot: woman in business attire against a neutral background, professional style",
  },
  {
    label: "cinematic · m",
    alt: "Sample AI headshot: man with dramatic editorial lighting, cinematic style",
  },
  {
    label: "natural · m",
    alt: "Sample AI headshot: man in soft daylight with a candid, approachable expression, natural style",
  },
  {
    label: "professional · f",
    alt: "Sample AI headshot: woman with sharp focus and a confident expression, professional style",
  },
];

export const PLANS = {
  starter: {
    name: "Starter",
    price: "$5.90",
    desc: "Try AI headshots fast, with no model training.",
    features: [
      { text: "20 blue credits", strong: " to generate images", lead: true },
      { text: "Generic AI generation — no personal model" },
      { text: "3 styles: professional, cinematic, natural" },
      { text: "High-resolution download" },
    ],
    cta: "Get started",
  },
  pro: {
    name: "Pro",
    price: "$11.90",
    desc: "Headshots that actually look like you.",
    features: [
      { text: "1 golden credit", strong: " to train your personal AI model", lead: true },
      { text: "20 blue credits", strong: " to generate headshots of your face", lead: true },
      { text: "Everything in Starter" },
      { text: "Model trained on your photos — results look like you" },
    ],
    cta: "Go Pro",
  },
};

export const ADDONS = [
  { text: "Need more images? ", strong: "+20 blue credits", price: "$4.90" },
  { text: "Need another model? ", strong: "+1 golden credit", price: "$6.90" },
];

export const FAQ = [
  {
    q: "What's the difference between Starter and Pro?",
    a: "Starter generates professional-looking headshots using a generic AI model — great for quick results. Pro trains a model specifically on your face, so the results actually look like you. For LinkedIn and professional use, Pro is the right choice.",
  },
  {
    q: "How long does training take?",
    a: "About 10 minutes. You'll get an email when your model is ready.",
  },
  {
    q: "How many selfies do I need to upload?",
    a: "Between 10 and 20. Variety helps — different angles, lighting, expressions. Avoid sunglasses or heavy filters.",
  },
  {
    q: "What styles are available?",
    a: "Professional (business attire, neutral background), Cinematic (dramatic editorial lighting), and Natural (soft, candid look). All three are included in every plan.",
  },
  {
    q: "Are my photos stored securely?",
    a: "Your uploaded selfies are used only for training your model and deleted afterward. Generated headshots are stored in your account for download.",
  },
  {
    // Email de contacto (placeholder; cambiar por el oficial más adelante)
    q: "Can I get a refund?",
    a: "If your model fails to train or results are unusable, we'll refund you or retrain at no cost. Reach out at juanimolfinooo@gmail.com.",
  },
];
