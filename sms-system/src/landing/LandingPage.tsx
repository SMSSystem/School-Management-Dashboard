import BottomBar from "./components/BottomBar";
import CtaBand from "./components/CtaBand";
import FeatureStory from "./components/FeatureStory";
import Header from "./components/Header";
import Hero from "./components/Hero";
import LandingFooter from "./components/LandingFooter";
import PrivacyBand from "./components/PrivacyBand";
import StepCards from "./components/StepCards";
import { useInView } from "./hooks/useInView";
import { ui } from "./content";

// The public landing page (docs/miscellaneous-specs/LANDING_PAGE_SPEC.md). Rendered to HTML at build time
// (entry-server.tsx) and brought to life in the browser (main.tsx). The first render must be the same in both places,
// so nothing here reads the browser before an effect runs.
//
// Landmarks: skip link, header (banner), main, footer (contentinfo, outside main). One h1 (the hero), an h2 per
// section, h3 for items.
export default function LandingPage() {
  // A 1px marker at the very top: while it is on screen the header splits over the hero.
  const [topRef, atTop] = useInView<HTMLDivElement>();
  const [heroCtaRef, heroCtaVisible] = useInView<HTMLDivElement>();

  return (
    <>
      <a
        href="#main"
        className="sr-only z-[60] rounded-full bg-primary px-4 py-2 font-ui font-bold text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {ui.skipLink}
      </a>
      <div
        ref={topRef}
        className="absolute top-0 h-px w-px"
        aria-hidden="true"
      />
      <Header atTop={atTop} />
      {/* tabIndex -1 lets the skip link move focus here in every browser. */}
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero ctaRef={heroCtaRef} />
        <FeatureStory />
        <StepCards />
        <PrivacyBand />
        <CtaBand />
      </main>
      <LandingFooter />
      <BottomBar visible={!heroCtaVisible && !atTop} />
    </>
  );
}
