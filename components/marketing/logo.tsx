import { siteConfig } from "@/lib/seo";

export function Logo() {
  return (
    <span className="logo">
      <span className="dot" />
      <b>{siteConfig.name}</b>
    </span>
  );
}
