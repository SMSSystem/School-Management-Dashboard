import { LaptopFrame } from "./DeviceFrame";
import Screenshot from "./Screenshot";
import { DisplayHeading, SectionHeader } from "./Headings";
import { steps, stepsSection } from "../content";

// Three cards that stack as the page scrolls: each sticks a little lower than the last (5, 6, 7rem), so it slides over
// the one before and leaves a stepped edge. Sticky only where a whole card fits on screen (landing.css, `.ld-step`,
// `min-height: 46rem`); on short screens and landscape phones they simply stack, so no content is ever covered.
const CARD = [
  "bg-surface-2 text-fg border border-line",
  "bg-pastel-blue text-on-pastel",
  "bg-step-dark text-white on-dark",
];
const TOPS = ["5rem", "6rem", "7rem"];

export default function StepCards() {
  return (
    <section
      id="steps"
      aria-labelledby="steps-title"
      className="mx-auto max-w-[75rem] px-6 pt-8 pb-24 lg:px-10 lg:pb-32"
    >
      <SectionHeader
        id="steps-title"
        kicker={stepsSection.kicker}
        title={stepsSection.title}
        align="center"
      />
      <ol className="mt-14">
        {steps.map((step, i) => (
          <li
            key={step.n}
            className={`ld-step mb-8 grid overflow-hidden rounded-[2rem] shadow-[0_-0.75rem_2.5rem_-1.5rem_rgb(15_23_42/0.45)] md:grid-cols-2 ${CARD[i]}`}
            style={{ top: TOPS[i] }}
          >
            <div className="flex flex-col justify-center p-8 sm:p-12">
              <span
                className="font-num text-5xl font-bold tabular opacity-75"
                aria-hidden="true"
              >
                {step.n}
              </span>
              <DisplayHeading
                as="h3"
                size="card"
                className="mt-4 text-3xl sm:text-4xl"
              >
                <span className="sr-only">Step {Number(step.n)}: </span>
                {step.title}
              </DisplayHeading>
              <p className="mt-4 max-w-md text-lg leading-relaxed opacity-90">
                {step.body}
              </p>
            </div>
            <div className="flex items-center p-6 sm:p-10">
              <LaptopFrame>
                <Screenshot
                  name={step.shot}
                  alt={step.alt}
                  sizes="(min-width: 48rem) 40vw, 85vw"
                />
              </LaptopFrame>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
