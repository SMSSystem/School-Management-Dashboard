import { useCallback, useEffect, useState } from "react";
import { enterFullscreen, fullscreenSupported, isFullscreen, type FullscreenDocument, type FullscreenElement } from "@/lib/examFullscreen";

// Whether the page is in fullscreen, and a way to ask for it again (a click is needed). Used on an unsupervised exam to show
// "Return to fullscreen"; the log of leaving it is in useActivityLog.
export function useFullscreen() {
  // The server render of the tests has no document: nothing is offered there.
  const doc: FullscreenDocument = typeof document === "undefined" ? {} : (document as unknown as FullscreenDocument);
  const [active, setActive] = useState(() => isFullscreen(doc));

  useEffect(() => {
    const change = () => setActive(isFullscreen(document as unknown as FullscreenDocument));
    document.addEventListener("fullscreenchange", change);
    document.addEventListener("webkitfullscreenchange", change);
    return () => {
      document.removeEventListener("fullscreenchange", change);
      document.removeEventListener("webkitfullscreenchange", change);
    };
  }, []);

  const enter = useCallback(() => enterFullscreen(document.documentElement as unknown as FullscreenElement), []);
  return { supported: fullscreenSupported(doc), active, enter };
}
