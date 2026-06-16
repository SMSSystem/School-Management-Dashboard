export type Theme = 'light' | 'dark';

const THEME_KEY = 'theme';

export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  const t = window.localStorage.getItem(THEME_KEY);
  if (t === 'light' || t === 'dark') return t;
  return null;
}

export function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function setTheme(theme: Theme) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_KEY, theme);
  }
  applyTheme(theme);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('theme-change', { detail: theme }));
  }
}

export function initTheme() {
  const stored = getStoredTheme();
  const theme = stored ?? 'light';
  applyTheme(theme);
}

export function toggleTheme(): Theme {
  const current = getStoredTheme() ?? getSystemTheme();
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
