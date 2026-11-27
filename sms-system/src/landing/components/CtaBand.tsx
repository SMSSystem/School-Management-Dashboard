import DemoLink from "./DemoLink";
import { DisplayHeading } from "./Headings";
import { cta } from "../content";
import { useInView } from "../hooks/useInView";

// The closing call to action: a dark card in both themes, so an `on-dark` area for the focus ring.
// It zooms in from 80% as it comes on screen (landing.css, "Call-to-action zoom"). Where the browser can tie the zoom
// to the scroll, CSS does it all; elsewhere `data-revealed` plays it once when the card is first seen.
export default function CtaBand() {
  const [cardRef, revealed] = useInView<HTMLDivElement>(
    "0px 0px -15% 0px",
    false,
    true,
  );
  return (
    <section
      aria-labelledby="cta-title"
      className="mx-auto max-w-[75rem] px-6 py-24 lg:px-10"
    >
      <div
        ref={cardRef}
        data-revealed={revealed || undefined}
        className="ld-cta-zoom on-dark rounded-[2.5rem] px-8 py-16 text-center text-white sm:px-16"
        style={{
          background:
            "linear-gradient(135deg, var(--hero-to) 0%, var(--hero-from) 100%)",
        }}
      >
        <DisplayHeading
          id="cta-title"
          size="section"
          className="text-4xl leading-tight sm:text-5xl"
        >
          {cta.title}
        </DisplayHeading>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">
          {cta.body}
        </p>
        <DemoLink className="mt-8 inline-flex min-h-12 items-center gap-1.5 rounded-full bg-sky px-8 font-ui font-bold text-night motion-safe:transition-colors motion-safe:duration-100 hover:bg-sky-hover" />
      </div>
    </section>
  );
}
