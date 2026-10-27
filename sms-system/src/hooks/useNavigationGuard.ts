import { useContext, useEffect } from "react";
import { NavigationGuardContext } from "@/lib/navigationGuardContext";

// A page with changes that are not saved calls useNavigationGuard(true): links, the back button, closing the tab and the
// header's Sign out and Start Tour then ask before leaving it. The guard is switched off when the page stops asking for it
// or goes away.
export function useNavigationGuard(active: boolean) {
  const guard = useContext(NavigationGuardContext);
  const setActive = guard?.setActive;
  useEffect(() => {
    setActive?.(active);
    return () => setActive?.(false);
  }, [setActive, active]);
}

const runAtOnce = (action: () => void) => action();

/** For a way out that is a button, not a link: `confirmLeave(() => ...)` asks first only while a page has unsaved changes. */
export function useConfirmLeave(): (action: () => void) => void {
  return useContext(NavigationGuardContext)?.confirmLeave ?? runAtOnce;
}
