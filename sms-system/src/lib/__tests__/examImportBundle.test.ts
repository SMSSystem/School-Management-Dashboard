import { describe, expect, it } from 'vitest';
import vercelRaw from '../../../vercel.json?raw';
import { LAYOUT_EXAMPLE } from '../examImportGuide';
import { EXAMPLE_PARAGRAPHS } from '../exampleDocx';

// Where the Word and PDF readers sit in the build (EXAMS_FEATURE_SPEC.md §4.4, §15 step 7, §16): each reader is loaded only
// when that kind of file is chosen, from the app's own origin, so the builder page and the entry chunk never carry the zip
// reader, pdf.js or the spreadsheet library. These read the source to keep it that way.

const sources = import.meta.glob('../../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
// The glob's keys are relative to this folder; turn each into a path from the project root (src/lib/docxText.ts).
const fromRoot = (key: string) => new URL(key, 'file:///src/lib/__tests__/_').pathname.slice(1);
const app = Object.entries(sources)
  .map(([key, text]) => [fromRoot(key), text.split('\r\n').join('\n')] as const)
  .filter(([path]) => !path.includes('__tests__'));

const importersOf = (needle: RegExp) => app.filter(([, text]) => needle.test(text)).map(([path]) => path).sort();

describe('the readers’ libraries', () => {
  it('only the Word reader, the example file and the picture module import the zip library', () => {
    expect(importersOf(/from 'fflate'|from "fflate"/)).toEqual(['src/lib/docxText.ts', 'src/lib/examImage.ts', 'src/lib/exampleDocx.ts']);
  });

  it('the byte-level picture module is imported by no screen yet, and the pack module, which needs no library, only by the save and load code', () => {
    expect(importersOf(/from ['"](@\/lib|\.)\/examImage['"]/)).toEqual([]);
    expect(importersOf(/from ['"](@\/lib|\.)\/examImagePack['"]/)).toEqual(['src/lib/examContent.ts']);
  });

  it('only the PDF reader mentions pdf.js, and always as a dynamic import', () => {
    expect(importersOf(/pdfjs-dist/)).toEqual(['src/lib/examPdf.ts']);
    const pdf = app.find(([path]) => path === 'src/lib/examPdf.ts')![1];
    expect(pdf).not.toMatch(/^import [^'\n]* from 'pdfjs-dist/m);
    expect(pdf).toContain("import('pdfjs-dist/legacy/build/pdf.mjs')");
  });

  it('nothing reaches a network address for them: no CDN in the readers', () => {
    for (const path of ['src/lib/examPdf.ts', 'src/lib/docxText.ts', 'src/lib/examDocx.ts', 'src/lib/examMarkdown.ts', 'src/lib/pdfWriter.ts', 'src/lib/examImportRead.ts']) {
      const text = app.find(([p]) => p === path)![1];
      expect(text, path).not.toMatch(/https?:\/\/(?!schemas\.)/);
    }
  });
});

describe('who loads the readers', () => {
  it('the readers are imported only dynamically, by the router, and the router only by the dialog', () => {
    const staticImport = (name: string) => new RegExp(`^import [^;]*from ['"][^'"]*${name}['"]`, 'm');
    for (const reader of ['examDocx', 'examPdf', 'examMarkdown', 'exampleDocx', 'examplePdf', 'exampleMarkdown', 'examImportFile']) {
      const staticImporters = app.filter(([path, text]) => staticImport(reader).test(text) && path !== `src/lib/${reader}.ts`).map(([path]) => path);
      expect(staticImporters, reader).toEqual([]);
    }
    expect(importersOf(/import\(["']@\/lib\/examImportRead["']\)/)).toEqual([
      'src/components/exam/builder/ExamImportDialog.tsx',
      'src/components/exam/builder/TemplateMenu.tsx',
    ]);
  });

  it('the router is light: it imports only the file-kind rules and types', () => {
    const router = app.find(([path]) => path === 'src/lib/examImportRead.ts')![1];
    const staticImports = [...router.matchAll(/^import [^;]*from ['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(staticImports.sort()).toEqual(['./examImport', './examImportKinds', '@/types/exams']);
  });
});

describe('the page’s security policy', () => {
  const csp = (JSON.parse(vercelRaw) as { headers: { headers: { key: string; value: string }[] }[] }).headers
    .flatMap((h) => h.headers)
    .find((h) => h.key.startsWith('Content-Security-Policy'))!.value;

  it('lets the PDF worker run from the app’s own origin and nothing from a CDN', () => {
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/cdn|unpkg|jsdelivr/i);
  });
});

describe('the layout guide', () => {
  it('shows the first lines of the example Word file', () => {
    expect(LAYOUT_EXAMPLE.slice(0, 6)).toEqual(EXAMPLE_PARAGRAPHS.slice(0, 6));
    expect(LAYOUT_EXAMPLE.slice(7)).toEqual(EXAMPLE_PARAGRAPHS.slice(7, 7 + LAYOUT_EXAMPLE.length - 7));
  });
});
