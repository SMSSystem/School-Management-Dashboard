import type { Ref } from "react";
import { Check } from "lucide-react";
import DemoLink from "./DemoLink";
import { LaptopFrame, PhoneFrame, PhoneShot } from "./DeviceFrame";
import Screenshot from "./Screenshot";
import { DisplayHeading } from "./Headings";
import { LOGIN_URL, hero, trust, ui } from "../content";

// Full-width hero that shrinks into an inset rounded card as the page scrolls (.ld-hero-card in landing.css; CSS only,
// static where unsupported or when motion is reduced). Always dark, in both themes, so it is an `on-dark` area.
export default function Hero({ ctaRef }: { ctaRef: Ref<HTMLDivElement> }) {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative">
      <div
        className="ld-hero-card on-dark relative overflow-hidden text-white"
        style={{
          background:
            "linear-gradient(160deg, var(--hero-from) 0%, var(--hero-to) 100%)",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 right-[-10%] size-[46rem] rounded-full opacity-30 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, var(--color-sky) 0%, transparent 65%)",
          }}
        />
        <div className="relative mx-auto grid max-w-[80rem] items-center gap-12 px-6 pt-28 pb-16 lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:px-10 lg:pt-40 lg:pb-24">
          <div>
            <p className="font-ui text-sm font-semibold tracking-wide text-sky uppercase">
              {hero.eyebrow}
            </p>
            <DisplayHeading
              as="h1"
              size="hero"
              id="hero-title"
              className="mt-4 text-[2.75rem] leading-[1.05] sm:text-6xl lg:text-[4.75rem]"
            >
              {hero.title}
            </DisplayHeading>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/85">
              {hero.body}
            </p>
            <div ref={ctaRef} className="mt-9 flex flex-col gap-3 sm:flex-row">
              <DemoLink className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-sky px-7 font-ui font-bold text-night motion-safe:transition-colors motion-safe:duration-100 hover:bg-sky-hover" />
              <a
                href={LOGIN_URL}
                className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-white/80 px-7 font-ui font-bold text-white motion-safe:transition-colors motion-safe:duration-100 hover:bg-white/10"
              >
                {ui.login}
              </a>
            </div>
          </div>
          {/* A laptop from tablet width up; a phone on phones. */}
          <div className="hidden md:block">
            <LaptopFrame>
              <Screenshot
                name={hero.shot}
                alt={hero.shotAlt}
                sizes="(min-width: 64rem) 46vw, 90vw"
                priority
              />
            </LaptopFrame>
          </div>
          <div className="md:hidden">
            <PhoneFrame>
              <PhoneShot alt={hero.phoneShotAlt} />
            </PhoneFrame>
          </div>
        </div>
        <ul className="relative mx-auto grid max-w-[80rem] gap-x-8 gap-y-3 border-t border-white/15 px-6 py-6 text-sm text-white/85 sm:grid-cols-2 lg:grid-cols-4 lg:px-10">
          {trust.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <Check
                className="mt-0.5 size-[1.1em] shrink-0 text-sky"
                aria-hidden="true"
              />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
