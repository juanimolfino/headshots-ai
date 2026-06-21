import Image from "next/image";
import logoVector from "../../app/headshot-logo-vector.jpg";
import { siteConfig } from "@/lib/seo";

export function Logo() {
  return (
    <span className="logo">
      <Image
        src={logoVector}
        alt=""
        width={32}
        height={32}
        className="logo-mark"
      />
      <b>{siteConfig.name}</b>
    </span>
  );
}
