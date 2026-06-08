import type { Config } from "tailwindcss";

/**
 * The landing page styles live in app/globals.css as plain CSS using the
 * design tokens (CSS custom properties). This config exposes those same tokens
 * to Tailwind utilities so the REST of the app can be built with classes like
 * `bg-surface text-ink border-line` and `font-serif` / `font-sans`.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        muted: "var(--muted)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        navy: {
          DEFAULT: "var(--navy)",
          deep: "var(--navy-deep)",
          tint: "var(--navy-tint)",
        },
        blue: "var(--blue)",
        gold: "var(--gold)",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: [
          "var(--font-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      maxWidth: { container: "1180px" },
      borderRadius: { card: "14px", plan: "20px", panel: "26px" },
      transitionTimingFunction: { soft: "cubic-bezier(.2,.7,.2,1)" },
    },
  },
  plugins: [],
};

export default config;
