import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LaptopFrame } from "./DeviceFrame";
import Screenshot from "./Screenshot";
import { DisplayHeading, SectionHeader } from "./Headings";
import { featuresSection, stories, ui, type Story } from "../content";

const TINT: Record<Story["tint"], string> = {
  blue: "bg-pastel-blue",
  lavender: "bg-pastel-lavender",
  mint: "bg-pastel-mint",
};

const STRIP_TAB_STOP = 0;

// The feature list in three layouts (landing.css, "Feature story"):
// - default (no JavaScript, or a mouse on a narrow screen): stacked blocks, each with its screenshot;
// - touch screens below 64rem: a horizontal swipe strip with scroll snapping, also usable by keyboard (the list is a
//   focusable scroll container) and by the Previous/Next buttons;
// - 64rem and wider with JavaScript: the text scrolls while one sticky screenshot follows the item in the middle of
//   the screen. The active item is marked by a bar, so state is never shown by fading alone.
export default function FeatureStory() {
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const strip = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting)
            setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    items.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const scrollStrip = (dir: 1 | -1) => {
    const el = strip.current;
    if (!el) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollBy({
      left: dir * el.clientWidth * 0.85,
      behavior: reduce ? "auto" : "smooth",
    });
  };

  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="mx-auto max-w-[80rem] px-6 py-24 lg:px-10 lg:py-32"
    >
      <SectionHeader
        id="features-title"
        kicker={featuresSection.kicker}
        title={featuresSection.title}
      />

      {/* minmax(0, ...) and min-w-0 keep the swipe strip from widening the grid to its full scroll length. */}
      <div className="mt-16 grid grid-cols-[minmax(0,1fr)] gap-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
        <div className="min-w-0">
          {/* Focusable so keyboard users can scroll the strip on touch layouts: a focused scroll container scrolls with
              the arrow keys natively (Safari does not make scrollers focusable on its own). */}
          <ol
            ref={strip}
            tabIndex={STRIP_TAB_STOP}
            aria-label={ui.swipeRegionLabel}
            className="ld-story-list flex flex-col gap-20 rounded-2xl lg:gap-0"
          >
            {stories.map((s, i) => (
              <li
                key={s.id}
                ref={(el) => {
                  items.current[i] = el;
                }}
                data-index={i}
                className={`ld-story-item flex flex-col justify-center border-l-4 pl-5 motion-safe:transition-colors motion-safe:duration-500 ${
                  active === i ? "lg:border-accent" : ""
                } border-transparent`}
              >
                <p className="font-ui text-sm font-semibold text-accent">
                  <span className="font-num tabular">
                    {String(i + 1).padStart(2, "0")}
                  </span>{" "}
                  · {s.kicker}
                </p>
                <DisplayHeading
                  as="h3"
                  size="story"
                  className="mt-3 text-3xl leading-snug text-heading sm:text-[2.125rem]"
                >
                  {s.title}
                </DisplayHeading>
                <p className="mt-4 max-w-md text-lg leading-relaxed text-muted">
                  {s.body}
                </p>
                <div
                  className={`ld-story-inline mt-8 rounded-[2rem] p-5 sm:p-8 ${TINT[s.tint]}`}
                >
                  <LaptopFrame>
                    <Screenshot
                      name={s.shot}
                      alt={s.alt}
                      sizes="(min-width: 48rem) 80vw, 85vw"
                    />
                  </LaptopFrame>
                </div>
              </li>
            ))}
          </ol>
          <div className="ld-swipe-controls js-only mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => scrollStrip(-1)}
              aria-label={ui.swipePrev}
              className="grid size-11 place-items-center rounded-full border border-line bg-surface-2 text-fg"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollStrip(1)}
              aria-label={ui.swipeNext}
              className="grid size-11 place-items-center rounded-full border border-line bg-surface-2 text-fg"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Wide screens with JavaScript only (landing.css). A visual duplicate of the screenshots each item already
            carries, so it is hidden from screen readers. */}
        <div className="ld-story-sticky" aria-hidden="true">
          <div className="sticky top-28">
            <div
              className={`relative aspect-[5/4] overflow-hidden rounded-[2rem] motion-safe:transition-colors motion-safe:duration-500 ${TINT[stories[active].tint]}`}
            >
              {stories.map((s, i) => (
                <div
                  key={s.id}
                  className={`ld-story-layer absolute inset-0 flex items-center p-10 ${
                    active === i
                      ? "translate-y-0 opacity-100"
                      : "pointer-events-none translate-y-4 opacity-0"
                  }`}
                >
                  <LaptopFrame>
                    <Screenshot
                      name={s.shot}
                      alt=""
                      sizes="(min-width: 64rem) 45vw, 1px"
                    />
                  </LaptopFrame>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
