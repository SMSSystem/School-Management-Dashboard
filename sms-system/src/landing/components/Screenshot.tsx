import { SHOT_WIDTHS, type ShotName } from "../content";

// A screenshot of the demo school in the page's current theme. Each shot exists in light and dark, at several widths
// (public/landing/shots/<name>[-dark]-<width>.webp), so the browser picks the sharpest one the screen needs, from a
// phone to a 4K TV. Both theme twins are in the HTML; the one for the other theme is `display: none`, which keeps it
// out of the accessibility tree and, being lazy, never downloaded.
//
// Every shot is lazy, the hero's included, so a visitor never downloads both twins; `priority` raises the hero's
// fetch priority so it still loads first.
const srcSet = (name: ShotName, dark: boolean) =>
  SHOT_WIDTHS.map(
    (w) => `/landing/shots/${name}${dark ? "-dark" : ""}-${w}.webp ${w}w`,
  ).join(", ");

export default function Screenshot({
  name,
  alt,
  sizes,
  priority = false,
  className = "",
}: {
  name: ShotName;
  alt: string;
  /** How wide the image is drawn, for srcset (CSS lengths; rem follows the page's root size). */
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const common = {
    sizes,
    width: 800,
    height: 500,
    loading: "lazy" as const,
    decoding: "async" as const,
    fetchPriority: priority ? ("high" as const) : ("auto" as const),
  };
  return (
    <>
      <img
        alt={alt}
        {...common}
        src={`/landing/shots/${name}-800.webp`}
        srcSet={srcSet(name, false)}
        className={`block dark:hidden ${className}`}
      />
      <img
        alt={alt}
        {...common}
        src={`/landing/shots/${name}-dark-800.webp`}
        srcSet={srcSet(name, true)}
        className={`hidden dark:block ${className}`}
      />
    </>
  );
}
