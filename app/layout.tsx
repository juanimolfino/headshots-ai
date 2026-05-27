import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getAppUrlObject } from "@/lib/app-url";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: getAppUrlObject(),
  title: {
    default: "AI SaaS Boilerplate",
    template: "%s | AI SaaS Boilerplate"
  },
  description: "Production-ready AI micro-SaaS starter with auth, billing, async AI jobs, credits, subscriptions, and SEO.",
  openGraph: {
    title: "AI SaaS Boilerplate",
    description: "Launch AI micro-SaaS products with the boring production pieces already wired.",
    url: "/",
    siteName: "AI SaaS Boilerplate",
    type: "website"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
