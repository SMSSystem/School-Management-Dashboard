import { useEffect, useRef, useState } from "react";

// One IntersectionObserver hook for the header (is the page at the very top?), the phone bottom bar (are the
// hero's own buttons on screen?) and the one-time reveals (privacy cards, call-to-action card). `rootMargin` is a
// string so the effect never re-subscribes on every render.
// `once`: stays true after the first time the element is seen, then stops watching. Every supported browser has
// IntersectionObserver (Safari since 12.1), so a reveal always ends; without JavaScript the CSS hides nothing.
export function useInView<T extends Element>(
  rootMargin = "0px",
  initial = true,
  once = false,
) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (once && !entry.isIntersecting) return;
        setInView(entry.isIntersecting);
        if (once) io.disconnect();
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, once]);

  return [ref, inView] as const;
}
