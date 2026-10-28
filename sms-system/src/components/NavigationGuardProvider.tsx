import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ConfirmDialog from "@/components/ConfirmDialog";
import { NavigationGuardContext, type NavigationGuard } from "@/lib/navigationGuardContext";
import { GUARD_STATE, isGuardState, popDecision } from "@/lib/navigationGuard";
import { watchLinks, watchUnload, type WatchEnv } from "@/lib/navigationGuardWatch";

// The unsaved-changes guard. BrowserRouter cannot block a navigation, so while a page holds unsaved changes this asks
// itself: a click on a link to another page is stopped and put to the person, the back button is caught by a marker entry
// in the history (pushed once, on the same address, so Back lands on the page again and shows the question), and closing
// the tab asks through the browser. Leaving by code (the inactivity sign-out, redirects, tours) is never stopped; only the
// two buttons a person presses, Sign out and Start Tour, go through confirmLeave. See lib/navigationGuard.ts for the rules.

type Pending = { kind: "link"; to: string } | { kind: "back" } | { kind: "action"; run: () => void };

const GENERAL_MESSAGE = "You have unsaved changes. Leaving now loses them.";

const here = () => ({ origin: window.location.origin, path: window.location.pathname + window.location.search });
// Built when used, not when this file loads, so a page rendered without a browser can import it.
const browser = (): WatchEnv => ({ document, window, here });
const historyState = () => window.history.state as { usr?: unknown; idx?: number } | null;
const onMarker = () => isGuardState(historyState()?.usr);
const historyIndex = () => historyState()?.idx ?? -1;

export default function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);
  // Set once the person chose to leave, so nothing asks a second time on the way out.
  const [released, setReleased] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  // The position of the marker entry in the history; going to an earlier position is the back button.
  const markerAt = useRef<number | null>(null);
  const watching = active && !released;
  const watchingRef = useRef(watching);
  useEffect(() => {
    watchingRef.current = watching;
  });

  useEffect(() => {
    if (!active) setReleased(false);
  }, [active]);

  // Clicks on links and closing the tab.
  useEffect(() => {
    if (!watching) return;
    const stopLinks = watchLinks(browser(), (to) => setPending({ kind: "link", to }));
    const stopUnload = watchUnload(browser());
    return () => {
      stopLinks();
      stopUnload();
    };
  }, [watching]);

  // The marker entry for the back button: pushed once when the guard goes on (not again if the page is already on it). When
  // the page stops asking (its changes were saved) with the marker still the current entry, the marker is stepped back over, so
  // one Back leaves the page as if the guard had not been there. A person who chose to leave (released) is already on the way out.
  useEffect(() => {
    if (!watching) {
      if (!active && markerAt.current !== null && onMarker()) navigate(-1);
      markerAt.current = null;
      return;
    }
    if (onMarker()) {
      markerAt.current = historyIndex();
    } else {
      markerAt.current = historyIndex() + 1;
      navigate(here().path, { state: GUARD_STATE });
    }
    // `active` is read only when the guard goes off; a change of it alone must not run this again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, navigate]);

  // Back: arriving at an entry before the marker's own means the person went back. The position is read from the history,
  // not from what was last rendered, so a Back pressed before the marker is drawn is still caught.
  useEffect(() => {
    if (!watching || markerAt.current === null) return;
    const behind = historyIndex() < markerAt.current;
    if (popDecision({ guardActive: behind, state: location.state }) === "ask") {
      markerAt.current = null;
      setPending({ kind: "back" });
    }
  }, [location, watching]);

  const confirmLeave = useCallback((run: () => void) => {
    if (!watchingRef.current) run();
    else setPending({ kind: "action", run });
  }, []);

  const guard = useMemo<NavigationGuard>(
    () => ({
      setActive: (on, text) => {
        setActive(on);
        setMessage(on ? text : undefined);
      },
      confirmLeave,
    }),
    [confirmLeave],
  );

  const stay = () => {
    if (pending?.kind === "back") {
      markerAt.current = historyIndex() + 1;
      navigate(here().path, { state: GUARD_STATE });
    }
    setPending(null);
  };

  const leave = () => {
    const chosen = pending;
    setPending(null);
    if (!chosen) return;
    setReleased(true);
    if (chosen.kind === "link") navigate(chosen.to, { replace: onMarker() });
    else if (chosen.kind === "back") navigate(-1);
    else chosen.run();
  };

  return (
    <NavigationGuardContext.Provider value={guard}>
      {children}
      {pending && (
        <ConfirmDialog
          title="Leave without saving?"
          message={message ?? GENERAL_MESSAGE}
          cancelLabel="Stay"
          confirmLabel="Leave without saving"
          tone="danger"
          onCancel={stay}
          onConfirm={leave}
        />
      )}
    </NavigationGuardContext.Provider>
  );
}
