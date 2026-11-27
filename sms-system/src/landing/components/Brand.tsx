import { PRODUCT_NAME, ui } from "../content";
import { DisplayHeading } from "./Headings";

// Product mark: the existing mortarboard-and-globe logo (public/logo.png) plus the working name. Its colour follows
// the header (`--hdr-fg`: white over the dark hero, the text colour elsewhere) and is the heading colour outside it.
export default function Brand() {
  return (
    <a
      href="#top"
      className="inline-flex min-h-11 items-center gap-2 rounded-lg"
      aria-label={`${PRODUCT_NAME}, ${ui.brandHome}`}
    >
      <img src="/logo.png" alt="" width={32} height={32} className="size-8" />
      <DisplayHeading
        as="span"
        size="brand"
        className="text-xl text-[var(--hdr-fg,var(--heading))]"
      >
        {PRODUCT_NAME}
      </DisplayHeading>
    </a>
  );
}
