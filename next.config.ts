import type { NextConfig } from "next";

// Content Security Policy
// - script/style need 'unsafe-inline' because Next.js App Router injects inline scripts for hydration
//   and Tailwind uses inline styles. A nonce-based CSP would remove this but requires
//   deeper middleware integration (future improvement).
// - The high-value directives are: object-src 'none', base-uri 'self', frame-ancestors 'none',
//   form-action limited to this app/Stripe — these block the most common injection and clickjacking attacks.
const csp = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.fal.media",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.fal.media",
  "frame-src https://js.stripe.com",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.vercel.app https://checkout.stripe.com",
  "frame-ancestors 'none'"
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: csp }
];

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.fal.media" }
    ]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
