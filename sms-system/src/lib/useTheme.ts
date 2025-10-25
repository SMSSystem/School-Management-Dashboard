import { useEffect, useState } from 'react';
import type { Theme } from './theme';

export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Theme | undefined;
      if (typeof document !== 'undefined') {
        setIsDark(detail ? detail === 'dark' : document.documentElement.classList.contains('dark'));
      }
    };
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
  }, []);

  return isDark;
}

