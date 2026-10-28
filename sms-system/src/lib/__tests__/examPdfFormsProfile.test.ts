import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { detectFormsProfile, normalizeFormsLines } from '../examPdfFormsProfile';
import { questionsFromLines } from '../examDocumentText';
import { questionsFromPdf } from '../examPdf';
import { KIND_MARKER_PREFIX, PICTURE_MARKER_PREFIX, kindOf } from '../examImportPictures';
import { makePdf, type PdfPicture } from '../pdfWriter';
import profileRaw from '../examPdfFormsProfile.ts?raw';

// Google Forms printouts (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.5). The lines below are written in the shape the
// spec describes, not copied from a real paper; the real papers are the manual check.

const img = (n: number) => `${PICTURE_MARKER_PREFIX}${n}`;
const single = `${KIND_MARKER_PREFIX}single`;
const multiple = `${KIND_MARKER_PREFIX}multiple`;

const HEADER = ['10/20/26, 3:41 PM Mechanical Workshop Practice Test', 'Mechanical Workshop Practice Test'];
const footer = (n: number, of: number) => `https://docs.google.com/forms/d/e/1FAIpQLSd/viewform ${n}/${of}`;

const page1 = [
  ...HEADER,
  'GENERAL INSTRUCTIONS',
  'Read each question carefully and choose the best answer.',
  '* Indicates required question',
  '1. Email *',
  '2. Which tool is shown in the diagram? * 1 point',
  img(0),
  'Mark only one oval.',
  'A vice',
  'A clamp',
  'A drill',
  'A saw',
  footer(1, 2),
];
const page2 = [
  ...HEADER,
  '3. Select all that are hand tools. * 2 points',
  'Check all that apply.',
  'Hammer',
  'Drill press',
  'Chisel',
  '4. Which numbered part is the 0.5 point',
  'tailstock of the lathe?',
  'I. Part 1',
  'II. Part 2',
  'Mark only one oval.',
  'Part 1',
  'Part 2',
  footer(2, 2),
];
const lines = [...page1, '', ...page2];

describe('detecting a Google Forms printout', () => {
  it('needs an oval line and a points figure at the end of a line', () => {
    expect(detectFormsProfile(lines)).toBe(true);
    expect(detectFormsProfile(['1. A question 1 point', 'A. one', 'B. two'])).toBe(false);
    expect(detectFormsProfile(['1. A question', 'Mark only one oval.', 'one', 'two'])).toBe(false);
    expect(detectFormsProfile(['Check all that apply.', 'something 2 points'])).toBe(true);
  });

  it('leaves a paper in the documented layout alone', () => {
    const documented = ['1. Which planet is red? [1 point]', 'A. Venus', 'B. Mars', 'Answer: B'];
    expect(normalizeFormsLines(documented)).toBeNull();
  });
});

describe('the lines of a printout, made into the documented layout', () => {
  const out = normalizeFormsLines(lines)!;

  it('drops the header and footer of every page, and everything before the first question', () => {
    const text = out.lines.join('\n');
    for (const gone of ['Mechanical Workshop', 'GENERAL INSTRUCTIONS', 'Indicates required', 'Email', 'docs.google.com']) expect(text).not.toContain(gone);
    expect(out.lines[0]).toBe('1. Which tool is shown in the diagram? [1 point]');
  });

  it('writes each question with its points, its picture, its kind and lettered options, and no answer', () => {
    expect(out.lines).toEqual([
      '1. Which tool is shown in the diagram? [1 point]',
      img(0),
      single,
      'A. A vice',
      'B. A clamp',
      'C. A drill',
      'D. A saw',
      '2. Select all that are hand tools. [2 points]',
      multiple,
      'A. Hammer',
      'B. Drill press',
      'C. Chisel',
      '3. Which numbered part is the tailstock of the lathe? I. Part 1 II. Part 2 [0.5 points]',
      single,
      'A. Part 1',
      'B. Part 2',
    ]);
    expect(out.lines.some((line) => /^answers?\b/i.test(line))).toBe(false);
  });

  it('numbers the questions in order from 1, whatever the form numbered them', () => {
    expect(out.lines.filter((l) => /^\d+\. /.test(l)).map((l) => l.split('.')[0])).toEqual(['1', '2', '3']);
  });

  it('is read by the question parser as questions with a kind and no key', () => {
    const result = questionsFromLines(out.lines, 'both');
    expect(result.questions.map((q) => [q.text, q.kind, q.points, q.options.length, q.correct.length])).toEqual([
      ['Which tool is shown in the diagram?', 'single', 1, 4, 0],
      ['Select all that are hand tools.', 'multiple', 2, 3, 0],
      ['Which numbered part is the tailstock of the lathe? I. Part 1 II. Part 2', 'single', 0.5, 2, 0],
    ]);
    expect(result.warnings.map((w) => w.message).every((m) => m.startsWith('No correct answer is given'))).toBe(true);
    expect(result.warnings).toHaveLength(3);
    expect(result.images).toEqual([{ index: 0, questionIndex: 0, confidence: 'clear' }]);
  });

  it('keeps a picture among or after the options where it stands (a check for the teacher)', () => {
    const more = normalizeFormsLines(['1. Q? 1 point', 'Mark only one oval.', 'one', img(0), 'two'])!;
    expect(more.lines).toEqual(['1. Q? [1 point]', single, 'A. one', img(0), 'B. two']);
    expect(questionsFromLines(more.lines, 'single').images).toEqual([{ index: 0, questionIndex: 0, confidence: 'check' }]);
  });

  it('drops a picture that comes before the first question', () => {
    const lead = normalizeFormsLines([img(0), 'Title', '1. Q? 1 point', 'Mark only one oval.', 'one', 'two'])!;
    expect(lead.lines.join('\n')).not.toContain(PICTURE_MARKER_PREFIX);
  });
});

describe('points, required marks and the form’s title', () => {
  it('reads 1 point, 2 points and 0.5 point, with the required star before or after', () => {
    const out = normalizeFormsLines(['1. A * 1 point', 'Mark only one oval.', 'x', 'y', '2. B 2 points *', 'Mark only one oval.', 'x', 'y', '3. C 0.5 point', 'Mark only one oval.', 'x', 'y'])!;
    expect(out.lines.filter((l) => /^\d+\./.test(l))).toEqual(['1. A [1 point]', '2. B [2 points]', '3. C [0.5 points]']);
  });

  it('drops a title that is repeated on every page, and keeps a question line that only looks like a page figure', () => {
    const pages = [
      ['Practice Test', '1. A 1 point', 'Mark only one oval.', '3/4', '1/4'],
      ['Practice Test', '2. B 1 point', 'Mark only one oval.', '1/2', '2/4'],
    ];
    const out = normalizeFormsLines([...pages[0], '', ...pages[1]])!;
    // The title repeats on both pages, so it goes; a page figure goes only when it is this page's number out of the file's pages
    // (here the file has two pages, so 3/4, 1/4, 1/2 and 2/4 are options).
    expect(out.lines.join('\n')).not.toContain('Practice Test');
    expect(out.lines).toContain('A. 3/4');
  });

  it('keeps all the lines of a one-page form that has no header, footer or title', () => {
    const out = normalizeFormsLines(['1. A 1 point', 'Mark only one oval.', 'x', 'y'])!;
    expect(out.lines).toEqual(['1. A [1 point]', single, 'A. x', 'B. y']);
  });
});

describe('more than six options', () => {
  it('are joined to the sixth with a warning that names the question', () => {
    const out = normalizeFormsLines(['1. A 1 point', 'Mark only one oval.', 'a', 'b', 'c', 'd', 'e', 'f', 'g'])!;
    expect(out.warnings).toEqual([{ question: 1, message: expect.stringContaining('7 options') }]);
    const result = questionsFromLines(out.lines, 'single');
    expect(result.questions[0].options).toHaveLength(6);
    expect(result.questions[0].options[5].text).toBe('f g');
  });
});

describe('the kind marker', () => {
  it('names a kind, and no other line does', () => {
    expect(kindOf(single)).toBe('single');
    expect(kindOf(multiple)).toBe('multiple');
    expect(kindOf(`${KIND_MARKER_PREFIX}other`)).toBeNull();
    expect(kindOf('single')).toBeNull();
  });

  it('is not text of a question, is ignored before the first question, and sets the type without changing the others', () => {
    const lines2 = [multiple, '1. A?', multiple, 'A. x', 'B. y', 'Answer: A', '2. B?', 'A. x', 'B. y', 'Answer: B'];
    const out = questionsFromLines(lines2, 'single');
    expect(out.questions.map((q) => [q.text, q.kind])).toEqual([['A?', 'multiple'], ['B?', 'single']]);
    expect(out.warnings.map((w) => w.message)).toEqual(['The type says multiple but 1 answer is given.']);
  });
});

describe('a printout as a real PDF', () => {
  const rgb = (seed: number) => Uint8Array.from({ length: 40 * 40 * 3 }, (_, i) => (i * 7 + seed * 53) & 255);
  const picture = (y: number): PdfPicture => ({ x: 72, y, width: 80, height: 60, pixelsWide: 40, pixelsHigh: 40, rgb: rgb(1) });

  it('finds the questions, their kinds and the picture between a question and its options, and asks for the key', async () => {
    // Rows are 16 points apart from the top (760); the picture's top edge (y + 60) lies between the question and its oval line.
    const first = [
      '10/20/26, 3:41 PM Practice Test', // 760
      'Practice Test', // 744
      '1. Email *', // 728
      '2. Which tool is shown in the diagram? 1 point', // 712
      '', // 696
      '', // 680
      '', // 664
      'Mark only one oval.', // 648
      'A vice', // 632
      'A clamp', // 616
      '3. Pick all the hand tools. 2 points', // 600
      'Check all that apply.', // 584
      'Hammer', // 568
      'Chisel', // 552
      'https://docs.google.com/forms/d/e/abc/viewform 1/2', // 536
    ];
    const second = ['10/20/26, 3:41 PM Practice Test', 'Practice Test', '4. Name the part. 1 point', 'Mark only one oval.', 'Part 1', 'Part 2', 'https://docs.google.com/forms/d/e/abc/viewform 2/2'];
    const out = await questionsFromPdf(pdfjs, makePdf([first, second], [[picture(640)], []]), 'both');
    expect(out.profile).toBe('google_forms');
    expect(out.questions.map((q) => [q.text, q.kind, q.points, q.options.map((o) => o.text)])).toEqual([
      ['Which tool is shown in the diagram?', 'single', 1, ['A vice', 'A clamp']],
      ['Pick all the hand tools.', 'multiple', 2, ['Hammer', 'Chisel']],
      ['Name the part.', 'single', 1, ['Part 1', 'Part 2']],
    ]);
    expect(out.images).toEqual([{ index: 0, questionIndex: 0, confidence: 'clear' }]);
    expect(out.pictures).toHaveLength(1);
    expect(out.warnings[0].message).toContain('printout of a Google Form');
    expect(out.warnings.filter((w) => w.message.startsWith('No correct answer is given'))).toHaveLength(3);
  });

  it('leaves a PDF in the documented layout as it was', async () => {
    const out = await questionsFromPdf(pdfjs, makePdf([['1. Q? [1 point]', 'A. one', 'B. two', 'Answer: A']]), 'single');
    expect(out.profile).toBeUndefined();
    expect(out.warnings).toEqual([]);
  });
});

describe('the profile module', () => {
  it('imports nothing but the shared words and a type, so it adds nothing to the PDF chunk', () => {
    const imports = profileRaw.split(/\r?\n/).filter((line) => line.startsWith('import '));
    expect(imports).toEqual(["import { KIND_MARKER_PREFIX, pictureIndexOf } from './examImportPictures';", "import type { ImportWarning } from './examImport';"]);
  });
});
