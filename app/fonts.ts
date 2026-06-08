import { Newsreader, Hanken_Grotesk } from "next/font/google";

// Serif display — títulos, precios, preguntas de FAQ
export const serif = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-serif",
  display: "swap",
});

// Sans — cuerpo + UI
export const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
