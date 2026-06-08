// =========================================================
// Placeholder — labeled striped image slot.
//
// TO DROP IN A REAL PHOTO, replace <Placeholder .../> with
// next/image, carrying the alt text across:
//
//   <Placeholder label="professional · f" alt="..." className="..." />
//   ->
//   <Image src="/images/headshot-pro-1.jpg" alt="..."
//          width={800} height={1000} className="ph" />
//
// Keep the `ph` class (rounded frame + aspect ratio) on the
// replacement and reuse the alt text for SEO.
// =========================================================
export function Placeholder({
  label,
  alt,
  className = "",
}: {
  label: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={`ph ${className}`}
      data-label={label}
      role="img"
      aria-label={alt}
    />
  );
}
