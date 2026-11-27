import DemoLink from "./DemoLink";

// Phones only (below 48rem) and only with JavaScript: a fixed "Try the demo" bar that appears once the hero's own
// buttons have scrolled away, as on deriv.be. Padded clear of the home indicator (.ld-bottom-bar). While hidden it is
// out of the tab order and the accessibility tree (`inert`), so focus never lands on something off screen.
export default function BottomBar({ visible }: { visible: boolean }) {
  return (
    <div
      className={`ld-bottom-bar glass js-only fixed inset-x-0 bottom-0 z-40 px-4 pt-3 md:hidden ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0"
      }`}
      inert={!visible}
    >
      <DemoLink className="flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-primary font-ui font-bold text-on-primary" />
    </div>
  );
}
