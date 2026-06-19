/* eslint-disable @next/next/no-img-element */

import { siteConfig } from "@/lib/seo";

export function Logo() {
  return (
    <span className="logo">
      <img
        src="/picyourai_icon_512_white.png"
        alt=""
        width={32}
        height={32}
        className="logo-mark"
      />
      <b>{siteConfig.name}</b>
    </span>
  );
}
