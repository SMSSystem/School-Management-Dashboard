import { useEffect, useRef, useState } from "react";

// One IntersectionObserver hook for the header (is the page at the very top?) and the phone bottom bar (are the
// hero's own buttons on screen?). `rootMargin` is a string so the effect never re-subscribes on every render.
export function useInView<T extends Element>(
  rootMargin = "0px",
  initial = true,
) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return [ref, inView] as const;
}
