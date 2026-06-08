// Thin line icons used in the "Why not a photographer" panel and pricing checks.

export function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 8.5l3 3 7-7.5" />
    </svg>
  );
}

export function WhyIcon({ name }: { name: "cost" | "speed" | "variety" | "comfort" }) {
  const common = {
    className: "ic",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    "aria-hidden": true,
  } as const;

  switch (name) {
    case "cost":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v9M14.4 9.4c-.5-.8-1.4-1.2-2.4-1.2-1.4 0-2.4.8-2.4 1.9 0 2.4 5 1.3 5 3.8 0 1.1-1.1 1.9-2.6 1.9-1.1 0-2-.5-2.5-1.3" />
        </svg>
      );
    case "speed":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case "variety":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="7" height="7" rx="1.4" />
          <rect x="13" y="4" width="7" height="7" rx="1.4" />
          <rect x="4" y="13" width="7" height="7" rx="1.4" />
          <rect x="13" y="13" width="7" height="7" rx="1.4" />
        </svg>
      );
    case "comfort":
      return (
        <svg {...common}>
          <path d="M5 19c0-3.3 3.1-6 7-6s7 2.7 7 6" />
          <circle cx="12" cy="8" r="3.4" />
        </svg>
      );
  }
}
