import { describe, expect, it } from 'vitest';
import { buildStaticGraph, offendersFor } from '../../../scripts/bundleGraphLogic.mjs';

// The first page load downloads everything that main.tsx reaches through static imports; code
// behind `import()` / React.lazy is fetched only when it is needed. This walks the static
// import graph from main.tsx (scripts/bundleGraphLogic.mjs: the TypeScript parser, so
// `import type` and `import()` are ignored, as the bundler ignores them) and fails if a heavy
// library or a page becomes reachable again.
//
// Why it exists: on 2026-10-16 the entry chunk was 3.9 MB (1.2 MB gzip). Four attendance files
// imported @react-pdf/renderer (about 1.5 MB) directly, and every page was a static import in
// App.tsx. See internal/regarding-frontend/BASELINE.md. To fix a failure, load the importing
// component with React.lazy (precedent: the report-card PDF modal in scenes/(dashboard)/report-cards),
// and register a new page in src/routes/lazyPages.ts instead of importing it in App.tsx.

const graph = buildStaticGraph();

// Libraries that must not be part of the first page load (sizes are from the 2026-10-16 baseline).
const LAZY_ONLY_PACKAGES = [
  '@react-pdf/renderer', // ~1.5 MB: the PDF engine
  '@e965/xlsx', // ~0.44 MB: spreadsheet import/export
  'recharts', // ~0.38 MB: dashboard charts
  'react-big-calendar', // ~0.2 MB together with moment
  'moment',
  'react-calendar',
  'react-colorful',
];

// The only scenes in the first load: the dashboard shell and the two sign-in screens.
const EAGER_SCENES = [
  'src/scenes/(auth)/change-password/index.tsx',
  'src/scenes/(auth)/login/index.tsx',
  'src/scenes/(dashboard)/index.tsx',
];

describe('the first page load (static import graph from main.tsx)', () => {
  it('walks the real app, so the rules below mean something', () => {
    expect(graph.files.has('src/App.tsx')).toBe(true);
    expect(graph.parent.has('src/App.tsx')).toBe(true);
    expect(graph.parent.size).toBeGreaterThan(30);
    // positive controls: packages the first load does need are found by the walk
    expect(graph.packageImporters.has('react-router-dom')).toBe(true);
    expect(graph.packageImporters.has('firebase')).toBe(true);
  });

  it.each(LAZY_ONLY_PACKAGES)('does not import %s statically', (pkg) => {
    expect(offendersFor(graph, pkg), 'load the importing component with React.lazy instead').toEqual([]);
  });

  it('includes only the shell and the sign-in screens among the scenes', () => {
    const scenes = [...graph.parent.keys()].filter((f) => f.startsWith('src/scenes/')).sort();
    expect(scenes, 'a page is imported statically; register it in src/routes/lazyPages.ts instead').toEqual(
      EAGER_SCENES,
    );
  });

  it('gets its pages from src/routes/lazyPages.ts', () => {
    expect(graph.staticImports('src/App.tsx')).toContain('@/routes/lazyPages');
    // lazyPages itself must only reach pages through import()
    expect(graph.staticImports('src/routes/lazyPages.ts').filter((s) => s.includes('scenes'))).toEqual([]);
  });

  it('keeps the attendance PDF components behind React.lazy', () => {
    // These files do import the PDF engine, and the walk does not reach them, which is the point.
    for (const file of [
      'src/scenes/(dashboard)/attendance/gridsheet/GridsheetPDFModal.tsx',
      'src/scenes/(dashboard)/attendance/gridsheet/GridsheetPDF.tsx',
      'src/components/attendance/AttendancePDFDownload.tsx',
      'src/components/attendance/AttendancePDF.tsx',
    ]) {
      expect(graph.files.has(file), `${file} exists`).toBe(true);
      expect(graph.staticImports(file), file).toContain('@react-pdf/renderer');
      expect(graph.parent.has(file), `${file} must not be reachable through static imports`).toBe(false);
    }
  });
});
