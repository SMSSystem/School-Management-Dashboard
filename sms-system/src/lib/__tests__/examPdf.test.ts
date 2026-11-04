import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PdfError, pagesOfPdf, questionsFromPdf } from '../examPdf';
import { linesOfPages } from '../pdfLines';
import { makePdf } from '../pdfWriter';
import { examTemplateRows, questionsFromRows } from '../examImport';
import type { BuilderQuestion } from '../examBuilderLogic';
import type { RawRow } from '../spreadsheetImport';
import sourceRaw from '../examPdf.ts?raw';

// Reading a text PDF with the real pdf.js legacy build under Node (EXAMS_FEATURE_SPEC.md §4.4). The PDFs are written here:
// a tiny file with one standard font and a line of text placed at a position for each line.

const strip = (qs: BuilderQuestion[]) =>
  qs.map((q) => ({ text: q.text, kind: q.kind, points: q.points, options: q.options.map((o) => o.text), correct: q.options.filter((o) => q.correct.includes(o.id)).map((o) => o.text) }));

const LAYOUT = [
  '1. Which planet is known as the Red Planet?',
  'A. Venus',
  'B. Mars',
  'C. Jupiter',
  'D. Mercury',
  'Answer: B',
  '2. Which of these are prime numbers? [2 marks]',
  'A. 2',
  'B. 4',
  'C. 7',
  'D. 9',
  'Answers: A, C',
  '3. Water boils at 100 degrees Celsius at sea level.',
  'A. True',
  'B. False',
  'Answer: A',
];

describe('a text PDF', () => {
  it('gives its text back line by line, in reading order, page after page', async () => {
    const { pages, pageCount } = await pagesOfPdf(pdfjs, makePdf([['First line', 'Second line'], ['On page two']]));
    expect(pageCount).toBe(2);
    expect(linesOfPages(pages)).toEqual(['First line', 'Second line', '', 'On page two']);
  });

  it('reads the exam layout into the same three questions as the spreadsheet template', async () => {
    const out = await questionsFromPdf(pdfjs, makePdf([LAYOUT.slice(0, 11), LAYOUT.slice(11)]), 'both');
    expect(out.warnings).toEqual([]);
    expect(strip(out.questions)).toEqual(strip(questionsFromRows(examTemplateRows() as RawRow[], 'both').questions));
  });

  it('joins a question or option that wraps onto the next printed line', async () => {
    const out = await questionsFromPdf(
      pdfjs,
      makePdf([['1. Read the passage and say what the', 'writer means by "home".', 'A. a place where people', 'live together', 'B. a feeling', 'Answer: B']]),
      'single',
    );
    expect(out.questions[0].text).toBe('Read the passage and say what the writer means by "home".');
    expect(out.questions[0].options.map((o) => o.text)).toEqual(['a place where people live together', 'a feeling']);
    expect(out.warnings).toEqual([]);
  });

  it('keeps brackets and backslashes in the text', async () => {
    const out = await questionsFromPdf(pdfjs, makePdf([['1. What is f(x) when x = 2?', 'A. (2)', 'B. 4 \\ 2', 'Answer: A']]), 'single');
    expect(out.questions[0].text).toBe('What is f(x) when x = 2?');
    expect(out.questions[0].options.map((o) => o.text)).toEqual(['(2)', '4 \\ 2']);
  });
});

describe('a PDF that cannot be used', () => {
  it('refuses a file with no text, as a scan or photo would be', async () => {
    await expect(questionsFromPdf(pdfjs, makePdf([[], []]), 'single')).rejects.toThrow(/no text to read/);
    await expect(questionsFromPdf(pdfjs, makePdf([['x']]), 'single')).rejects.toThrow(PdfError);
  });

  it('refuses bytes that are not a PDF', async () => {
    await expect(pagesOfPdf(pdfjs, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).rejects.toThrow(/could not be read as a PDF/);
  });
});

describe('where pdf.js comes from', () => {
  const source = sourceRaw.split('\r\n').join('\n');

  it('is the legacy build, with its worker and nothing else fetched from this app, and no network address in the code', () => {
    expect(source).toContain("import('pdfjs-dist/legacy/build/pdf.mjs')");
    expect(source).toContain("import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')");
    expect(source).toContain('lib.GlobalWorkerOptions.workerSrc = worker.default');
    expect(source).not.toMatch(/https?:\/\//);
  });

  it('reads only text: no system fonts and no WebAssembly image decoders', () => {
    expect(source).toContain('useSystemFonts: false, useWasm: false');
  });

  it('refuses a password-protected file with its own message and always destroys the loading task', () => {
    expect(source).toContain("'PasswordException'");
    expect(source).toContain('await task.destroy()');
  });

  it('reads at most 60 pages and says when it stopped', () => {
    expect(source).toContain('const MAX_PDF_PAGES = 60');
    expect(source).toContain('Only the first ${MAX_PDF_PAGES} of ${pageCount} pages were read.');
  });
});
