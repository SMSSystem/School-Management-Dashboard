import { useEffect, useState } from "react";

// What shows while a page's code is being fetched (every page is loaded on demand, see
// src/routes/lazyPages.ts). The spinner appears only after a short delay, so a page that arrives
// quickly (cached, or prefetched from the sidebar) replaces the old one without a flash.
const SHOW_AFTER_MS = 150;

export default function RouteFallback({ fullScreen = false }: { fullScreen?: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center ${fullScreen ? "min-h-screen" : "min-h-[40vh]"}`}
    >
      {visible && (
        <>
          <div
            className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
          <span className="sr-only">Loading page…</span>
        </>
      )}
    </div>
  );
}
