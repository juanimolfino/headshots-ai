import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/seo";

export const size = {
  width: 1200,
  height: 630
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f8f6f0",
          color: "#1d1d1b",
          padding: 72,
          fontFamily: "Arial"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 24, height: 24, borderRadius: 999, background: "#1b2440" }} />
          <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: -1 }}>{siteConfig.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 86, lineHeight: 0.95, fontWeight: 700, letterSpacing: -4, maxWidth: 900 }}>
            AI headshots that still look like you.
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.25, color: "#4a4740", maxWidth: 760 }}>
            Upload selfies, train a personal model, and generate professional photos for LinkedIn,
            resumes, portfolios, and business profiles.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 26 }}>
          <span>{siteConfig.url.replace(/^https?:\/\//, "")}</span>
          <span style={{ color: "#1b2440", fontWeight: 700 }}>Studio quality in minutes</span>
        </div>
      </div>
    ),
    size
  );
}
