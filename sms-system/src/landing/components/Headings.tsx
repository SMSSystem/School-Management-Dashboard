import type { ReactNode } from "react";

// Fraunces headings. Its optical-size axis is set to the heading's size so large titles get the display cut and
// small ones the text cut (font-variation-settings "opsz"); one place instead of a copy in every section.
const OPSZ = {
  hero: 144,
  section: 96,
  card: 60,
  story: 48,
  brand: 36,
} as const;

export function DisplayHeading({
  as: Tag = "h2",
  size,
  id,
  className = "",
  children,
}: {
  as?: "h1" | "h2" | "h3" | "p" | "span";
  size: keyof typeof OPSZ;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      id={id}
      className={`font-display font-semibold ${className}`}
      style={{ fontVariationSettings: `"opsz" ${OPSZ[size]}` }}
    >
      {children}
    </Tag>
  );
}

// The small upper-case label and h2 that open each section. `align` centres both; `tone="onDark"` for the dark bands.
export function SectionHeader({
  id,
  kicker,
  title,
  align = "start",
  tone = "default",
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  align?: "start" | "center";
  tone?: "default" | "onDark";
  children?: ReactNode;
}) {
  return (
    <div
      className={`ld-reveal max-w-3xl ${align === "center" ? "mx-auto text-center" : ""}`}
    >
      <p
        className={`font-ui text-sm font-semibold tracking-wide uppercase ${tone === "onDark" ? "text-sky" : "text-accent"}`}
      >
        {kicker}
      </p>
      <DisplayHeading
        id={id}
        size="section"
        className={`mt-3 text-4xl leading-tight sm:text-5xl ${tone === "onDark" ? "text-white" : "text-heading"}`}
      >
        {title}
      </DisplayHeading>
      {children}
    </div>
  );
}
