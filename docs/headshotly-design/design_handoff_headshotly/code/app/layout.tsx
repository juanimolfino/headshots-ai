import type { Metadata } from "next";
import { serif, sans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Headshot Generator — Studio Quality in Minutes | headshotly.pro",
  description:
    "Upload your selfies and get professional AI headshots for LinkedIn, resumes, and your website. Personal model trained on your face. Ready in 10 minutes. From $5.90.",
  openGraph: {
    title: "AI Headshot Generator — Studio Quality in Minutes | headshotly.pro",
    description:
      "Upload your selfies and get professional AI headshots for LinkedIn, resumes, and your website. Personal model trained on your face. Ready in 10 minutes. From $5.90.",
    type: "website",
    siteName: "headshotly.pro",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `js` enables the reveal-from-hidden start state; it is set statically so
    // above-the-fold content still renders if JS is disabled (reveal CSS only
    // hides under `.js` AND is overridden by prefers-reduced-motion).
    <html lang="en" className={`js ${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
