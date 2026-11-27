import { lazy, Suspense, useState, type MouseEvent, type ReactNode } from "react";
import {
  leavingText,
  shouldConfirmLeaving,
  type LeavingSource,
} from "@/lib/outsideLinks";

// Loaded only when a `leaving` link is clicked. The dialog reads the signed-in site name (hooks/useSiteName.ts ->
// AuthContext -> Firebase), so a static import would put Firebase into every page that shows an outside link,
// including the public landing page (src/landing/), which must never load it.
const LeavingDialog = lazy(() => import("@/components/LeavingDialog"));

// Every link to another site goes through this component, so they all open in a new tab cut off from this page
// (rel="noopener noreferrer"), and screen readers hear that they open a new tab. Add new outside links here, never as a
// bare <a target="_blank">.
//
// `leaving` asks first, with the "You're leaving" dialog (components/LeavingDialog.tsx). It's set where a link's
// address isn't ours to vouch for: links a teacher typed on a lesson note, and the changelog link, which goes to
// GitHub. Without it the link opens at once (the sign-in page's footer, whose addresses are fixed in the code).
//
// What `leaving` catches: a plain click, a click with Ctrl, Cmd, Shift or Alt, and a middle click, all of which would
// otherwise open the site straight away. What still gets past, by design of the browser: "Open link in new tab" from
// the right-click menu, and dragging the link to the tab bar. The dialog is a check, not a wall.

export default function OutsideLink({
  href,
  leaving,
  className,
  ariaLabel,
  children,
}: {
  href: string;
  /** Ask with the "You're leaving" dialog first, saying where the link came from. */
  leaving?: LeavingSource;
  className?: string;
  /** A full accessible name, when the visible content isn't text; it should say it opens a new tab. */
  ariaLabel?: string;
  children: ReactNode;
}) {
  const [asking, setAsking] = useState(false);

  const ask = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!leaving || !shouldConfirmLeaving(e)) return;
    // Stop the browser following the link (in this tab, a new tab or a new window); the dialog decides.
    e.preventDefault();
    setAsking(true);
  };

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        onClick={ask}
        onAuxClick={ask}
        className={className}
      >
        {children}
        {!ariaLabel && <span className="sr-only"> {leavingText.newTab}</span>}
      </a>
      {asking && leaving && (
        <Suspense fallback={null}>
          <LeavingDialog
            url={href}
            source={leaving}
            onClose={() => setAsking(false)}
          />
        </Suspense>
      )}
    </>
  );
}
