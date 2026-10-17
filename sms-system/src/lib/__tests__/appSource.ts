// The routing code as text, for the tests that pin route guards and the error boundaries (they read
// source, like the other guard tests). It lives in App.tsx and the files App.tsx hands its routes to,
// so a test asks for the whole of it here instead of naming one file. Line endings are made "\n".

const files = import.meta.glob(
  [
    '../../App.tsx',
    '../../routes/*Routes.tsx',
    '../../routes/dashboardHome.tsx',
    '../../components/TourAutoTrigger.tsx',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const norm = (s: string) => s.split('\r\n').join('\n');

/** One file of the routing code, by its path under src/ (for example "App.tsx" or "routes/peopleRoutes.tsx"). */
export function routingFile(path: string): string {
  const text = files[`../../${path}`];
  if (typeof text !== 'string') throw new Error(`no routing file ${path}`);
  return norm(text);
}

/** App.tsx and every file of routes it renders, joined (App.tsx first). */
export const appSource: string = Object.keys(files)
  .sort((a, b) => (a.endsWith('/App.tsx') ? -1 : b.endsWith('/App.tsx') ? 1 : a.localeCompare(b)))
  .map((k) => norm(files[k]))
  .join('\n');
