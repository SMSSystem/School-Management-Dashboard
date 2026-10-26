import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PdfSnapshot from '../../components/exam/builder/PdfSnapshot';
import ImportImageReview from '../../components/exam/builder/ImportImageReview';
import dialogRaw from '../../components/exam/builder/ExamImportDialog.tsx?raw';
import snapshotRaw from '../../components/exam/builder/PdfSnapshot.tsx?raw';
import examPdfRaw from '../examPdf.ts?raw';
import {
  MIN_SNAPSHOT_PX,
  SNAPSHOT_MAX_SIDE,
  boxFromDrag,
  boxFromPercent,
  boxToPercent,
  clampBox,
  snapshotScale,
  wholePage,
} from '../pdfSnapshotBox';
import { addSnapshot, applyPrepared, canContinue, chosen, keepAllClear, startReview } from '../examImportReview';
import type { PreparedImage } from '../examBuilderLogic';

// The snapshot tool of the PDF import (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.2): the box arithmetic, the
// review item a snapshot becomes, and the screens and pins. Drawing a page needs a browser canvas and is a manual check.

const norm = (s: string) => s.split('\r\n').join('\n');
const dialog = norm(dialogRaw);
const snapshot = norm(snapshotRaw);
const examPdf = norm(examPdfRaw);
const noop = () => undefined;

describe('the scale a page is drawn at', () => {
  it('is 2, or less so that no side is longer than 3,000 pixels', () => {
    expect(snapshotScale(612, 792)).toBe(2);
    expect(snapshotScale(1500, 2000)).toBe(1.5);
    expect(snapshotScale(3000, 3000)).toBe(1);
    expect(snapshotScale(612, 792) * 792).toBeLessThanOrEqual(SNAPSHOT_MAX_SIDE);
    expect(snapshotScale(0, 0)).toBe(2);
  });
});

describe('the box', () => {
  it('is clamped inside the page, in whole pixels, in whichever direction it was dragged', () => {
    expect(clampBox({ x: 10.4, y: 20.6, width: 99.8, height: 50 }, 500, 400)).toEqual({ x: 10, y: 21, width: 100, height: 50 });
    expect(clampBox({ x: 450, y: 350, width: 200, height: 200 }, 500, 400)).toEqual({ x: 450, y: 350, width: 50, height: 50 });
    expect(clampBox({ x: -30, y: -30, width: 100, height: 100 }, 500, 400)).toEqual({ x: 0, y: 0, width: 70, height: 70 });
    expect(boxFromDrag({ x: 200, y: 200 }, { x: 100, y: 120 }, 500, 400)).toEqual({ x: 100, y: 120, width: 100, height: 80 });
  });

  it('is nothing when it is smaller than the minimum, or off the page', () => {
    expect(clampBox({ x: 10, y: 10, width: MIN_SNAPSHOT_PX - 1, height: 100 }, 500, 400)).toBeNull();
    expect(clampBox({ x: 10, y: 10, width: 100, height: MIN_SNAPSHOT_PX - 1 }, 500, 400)).toBeNull();
    expect(clampBox({ x: 600, y: 10, width: 100, height: 100 }, 500, 400)).toBeNull();
    expect(boxFromDrag({ x: 5, y: 5 }, { x: 6, y: 6 }, 500, 400)).toBeNull();
  });

  it('goes to percentages of the page and back, and the whole page is the whole canvas', () => {
    const box = { x: 100, y: 80, width: 250, height: 200 };
    const percent = boxToPercent(box, 500, 400);
    expect(percent).toEqual({ left: 20, top: 20, width: 50, height: 50 });
    expect(boxFromPercent(percent, 500, 400)).toEqual(box);
    expect(wholePage(500, 400)).toEqual({ x: 0, y: 0, width: 500, height: 400 });
    expect(boxFromPercent({ left: 0, top: 0, width: 100, height: 100 }, 500, 400)).toEqual(wholePage(500, 400));
  });

  it('refuses numbers that are not a box', () => {
    expect(boxFromPercent({ left: Number.NaN, top: 0, width: 50, height: 50 }, 500, 400)).toBeNull();
    expect(boxFromPercent({ left: 10, top: 10, width: 0, height: 50 }, 500, 400)).toBeNull();
    expect(boxFromPercent({ left: 95, top: 10, width: 2, height: 50 }, 500, 400)).toBeNull();
  });
});

describe('a snapshot in the review', () => {
  const prepared = (data: string): PreparedImage => ({ mime: 'image/png', data: `data:image/png;base64,${data}`, bytes: 10, w: 40, h: 30, exact: true, report: '1 KB, kept exactly' });

  it('is added on the question chosen, used, and ready once the picture check has passed it', () => {
    const items = addSnapshot(startReview([], []), 0, 2);
    expect(items).toEqual([{ index: 0, questionIndex: 2, confidence: 'clear', decision: 'use', prepared: null, refusal: null, alt: '' }]);
    expect(chosen(items)).toEqual([]);
    const ready = applyPrepared(items, 0, { ok: true, picture: prepared('S') });
    expect(chosen(ready)).toEqual([{ questionIndex: 2, picture: expect.objectContaining({ data: 'data:image/png;base64,S' }) }]);
    expect(canContinue(ready)).toBe(true);
  });

  it('follows the file’s own pictures, keeps their decisions, and is removed by a refusal like any other', () => {
    const base = keepAllClear(
      applyPrepared(startReview([{ index: 0, questionIndex: 0, confidence: 'clear' }], [{ bytes: new Uint8Array([1]), format: 'png', alt: 'A', cropped: false }]), 0, { ok: true, picture: prepared('A') }),
    );
    const items = addSnapshot(base, 1, 1);
    expect(items.map((i) => [i.index, i.questionIndex, i.decision])).toEqual([[0, 0, 'use'], [1, 1, 'use']]);
    const refused = applyPrepared(items, 1, { ok: false, message: 'too large' });
    expect(refused[1]).toMatchObject({ decision: 'removed', refusal: 'too large' });
  });

  it('is held back by a clash with another picture used on the same question', () => {
    const base = keepAllClear(
      applyPrepared(startReview([{ index: 0, questionIndex: 1, confidence: 'clear' }], [{ bytes: new Uint8Array([1]), format: 'png', alt: '', cropped: false }]), 0, { ok: true, picture: prepared('A') }),
    );
    const items = applyPrepared(addSnapshot(base, 1, 1), 1, { ok: true, picture: prepared('S') });
    expect(canContinue(items)).toBe(false);
  });
});

describe('the screens', () => {
  it('shows the snapshot panel before the page is drawn: instructions, page controls, the fields, a question picker and a disabled Add', () => {
    const html = renderToStaticMarkup(createElement(PdfSnapshot, { bytes: new Uint8Array(1), questions: [{ text: 'Which tool?' }, { text: 'Which is stronger?' }], onAdd: noop, onCancel: noop }));
    expect(html).toContain('A figure drawn with lines and shapes is not a picture the file holds');
    expect(html).toContain('Loading the page…');
    for (const label of ['Left (%)', 'Top (%)', 'Width (%)', 'Height (%)', 'Whole page', 'Previous page', 'Next page']) expect(html).toContain(label);
    expect(html).toContain('Which question does it belong to?');
    expect(html).toContain('Question 1: Which tool?');
    expect(html).toContain('Question 2: Which is stronger?');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Add picture/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Whole page/);
  });

  it('offers the snapshot button in the picture step only when the page gives it, and says when the file had no picture', () => {
    const base = { items: [], questions: [{ text: 'Q' }], onUse: noop, onMove: noop, onRemove: noop, onUseAllClear: noop, onBack: noop, onContinue: noop };
    const without = renderToStaticMarkup(createElement(ImportImageReview, base));
    expect(without).not.toContain('Add a snapshot of a figure');
    const withIt = renderToStaticMarkup(createElement(ImportImageReview, { ...base, onAddSnapshot: noop }));
    expect(withIt).toContain('Add a snapshot of a figure');
    expect(withIt).toContain('No picture was found in the file.');
  });
});

describe('pins', () => {
  it('the dialog loads the panel’s pdf.js code only when the panel works, and only a PDF result has the button', () => {
    expect(dialog).toContain('canSnapshot = result?.source?.kind === "pdf"');
    expect(dialog).toContain('onAddSnapshot={canSnapshot ? () => openSnapshot("pictures") : undefined}');
    expect(dialog).toContain('{canSnapshot && !hasPictures && found > 0 && (');
    expect(dialog).not.toMatch(/pdfjs|examPdfSnapshot/);
    expect(snapshot).toContain('await import("@/lib/examPdfSnapshot")');
    expect(snapshot).not.toMatch(/^import (?!type)[^\n]*examPdfSnapshot/m);
  });

  it('the page is drawn from the app’s own copy of pdf.js and its worker, and the panel keeps the bytes of the file in the result only for a PDF', () => {
    expect(examPdf).toContain("import('pdfjs-dist/legacy/build/pdf.mjs')");
    expect(examPdf).toContain("source: { kind: 'pdf', bytes }");
    expect(examPdf).not.toMatch(/https?:\/\//);
  });
});
