import { useEffect, useState } from 'react';

// Tracks a CSS media query. Used where layout has to change in JS (not just
// via Tailwind breakpoints), e.g. the sidebar rendering expanded inside the
// mobile drawer regardless of the desktop "collapsed" preference.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

// Tailwind's `md` breakpoint (768px) is where the sidebar stops being a drawer.
export const MOBILE_QUERY = '(max-width: 767px)';
