import DemoLink from "./DemoLink";
import { DisplayHeading } from "./Headings";
import { cta } from "../content";

// The closing call to action: a dark card in both themes, so an `on-dark` area for the focus ring.
export default function CtaBand() {
  return (
    <section
      aria-labelledby="cta-title"
      className="mx-auto max-w-[75rem] px-6 py-24 lg:px-10"
    >
      <div
        className="ld-reveal on-dark rounded-[2.5rem] px-8 py-16 text-center text-white sm:px-16"
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
        <DemoLink className="mt-8 inline-flex min-h-12 items-center gap-1.5 rounded-full bg-sky px-8 font-ui font-bold text-night transition-colors duration-100 hover:bg-sky-hover" />
      </div>
    </section>
  );
}
