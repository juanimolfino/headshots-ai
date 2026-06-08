import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./emails/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",

        // headshotly.pro design tokens (aditivo, no pisa shadcn)
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        "ink-muted": "var(--ink-muted)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        navy: {
          DEFAULT: "var(--navy)",
          deep: "var(--navy-deep)",
          sidebar: "var(--navy-sidebar)",
          tint: "var(--navy-tint)",
          foreground: "var(--navy-foreground)"
        },
        blue: "var(--blue)",
        gold: {
          DEFAULT: "var(--gold)",
          foreground: "var(--gold-foreground)"
        },
        sage: {
          DEFAULT: "var(--sage)",
          deep: "var(--sage-deep)",
          tint: "var(--sage-tint)",
          line: "var(--sage-line)",
          side: "var(--sage-side)"
        },
        ready: {
          DEFAULT: "var(--ready)",
          bg: "var(--ready-bg)",
          line: "var(--ready-line)"
        }
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: [
          "var(--font-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif"
        ]
      },
      maxWidth: {
        container: "1180px"
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // headshotly.pro (aditivo)
        card: "14px",
        plan: "20px",
        panel: "26px"
      },
      transitionTimingFunction: {
        soft: "cubic-bezier(.2,.7,.2,1)"
      }
    }
  },
  plugins: []
};

export default config;
