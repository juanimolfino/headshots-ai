import type { Metadata } from "next";
import { getAppUrlObject } from "@/lib/app-url";
import { serif, sans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getAppUrlObject(),
  title: {
    default: "Headshots AI",
    template: "%s | Headshots AI"
  },
  description: "Generá headshots profesionales con inteligencia artificial. Subí tus fotos y obtené retratos para LinkedIn, CV y más.",
  openGraph: {
    title: "Headshots AI",
    description: "Generá headshots profesionales con inteligencia artificial.",
    url: "/",
    siteName: "Headshots AI",
    type: "website"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${serif.variable} ${sans.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
