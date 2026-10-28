import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { unzlibSync } from 'fflate';
import { encodePng, inspectImage } from '../examImage';
import { questionsFromPdf } from '../examPdf';
import {
  MAX_PDF_PICTURES,
  MAX_PDF_PICTURE_PIXELS,
  PictureCollector,
  dropDecorations,
  pixelKey,
  pixelsOf,
  placementsOf,
  type FoundPicture,
} from '../examPdfImages';
import { linesOfPage, linesOfPages, type TextPiece } from '../pdfLines';
import { makePdf, type PdfPicture } from '../pdfWriter';
import { PICTURE_MARKER_PREFIX } from '../examImportPictures';

// The pictures of a PDF (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.2): placed among the text lines by
// where they are painted, read from real PDFs with the real pdf.js legacy build under Node, and the pure parts on hand-made
// operator lists. The PDFs are written here (pdfWriter.ts), with RGB pictures at exact places.

const m = (n: number) => `${PICTURE_MARKER_PREFIX}${n}`;

/** RGB pixels that differ from one picture to the next (and inside a picture). */
function rgb(width: number, height: number, seed: number): Uint8Array {
  const out = new Uint8Array(width * height * 3);
  for (let i = 0; i < out.length; i += 1) out[i] = (i * 7 + seed * 53) & 255;
  return out;
}
const picture = (x: number, y: number, width: number, height: number, seed: number, pixels = 40): PdfPicture => ({ x, y, width, height, pixelsWide: pixels, pixelsHigh: pixels, rgb: rgb(pixels, pixels, seed) });

describe('where a picture stands among the lines', () => {
  const piece = (str: string, y: number): TextPiece => ({ str, x: 72, y, width: 100, height: 12 });
  const rows = [piece('1. Question', 700), piece('A. one', 600), piece('B. two', 580)];

  it('puts the marker before the first line that starts below the top of the picture', () => {
    expect(linesOfPage(rows, [{ top: 650, index: 0 }])).toEqual(['1. Question', m(0), 'A. one', 'B. two']);
    expect(linesOfPage(rows, [{ top: 590, index: 0 }])).toEqual(['1. Question', 'A. one', m(0), 'B. two']);
  });

  it('puts text beside a picture after it, a picture above everything first and one below everything last', () => {
    expect(linesOfPage(rows, [{ top: 720, index: 0 }])).toEqual([m(0), '1. Question', 'A. one', 'B. two']);
    expect(linesOfPage(rows, [{ top: 100, index: 3 }])).toEqual(['1. Question', 'A. one', 'B. two', m(3)]);
    expect(linesOfPage(rows, [{ top: 690, index: 1 }])).toEqual(['1. Question', m(1), 'A. one', 'B. two']);
  });

  it('orders several pictures by height and gives a page without any the lines it had', () => {
    expect(linesOfPage(rows, [{ top: 585, index: 1 }, { top: 690, index: 0 }])).toEqual(['1. Question', m(0), 'A. one', m(1), 'B. two']);
    expect(linesOfPage(rows)).toEqual(['1. Question', 'A. one', 'B. two']);
    expect(linesOfPages([rows, rows], [[], [{ top: 650, index: 0 }]])).toEqual(['1. Question', 'A. one', 'B. two', '', '1. Question', m(0), 'A. one', 'B. two']);
  });
});

describe('the operator list', () => {
  const OPS = pdfjs.OPS;

  it('places a picture by the transform in force: save, transform, paint, restore', () => {
    const fn = [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore, OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore];
    const args = [[], [200, 0, 0, 100, 72, 600], ['img_1', 4, 2], [], [], [50, 0, 0, 40, 300, 100], ['img_2', 4, 2], []];
    const { placements, masks } = placementsOf(fn, args, OPS);
    expect(masks).toBe(0);
    expect(placements.map((p) => [p.id, p.box])).toEqual([
      ['img_1', { x: 72, y: 600, width: 200, height: 100 }],
      ['img_2', { x: 300, y: 100, width: 50, height: 40 }],
    ]);
  });

  it('combines nested transforms, flipped pictures and a form, and forgets a transform at restore', () => {
    const fn = [OPS.save, OPS.transform, OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore, OPS.restore, OPS.paintImageXObject, OPS.paintFormXObjectBegin, OPS.paintImageXObject, OPS.paintFormXObjectEnd];
    const args = [[], [2, 0, 0, 2, 10, 20], [], [50, 0, 0, -30, 5, 40], ['a', 1, 1], [], [], ['b', 1, 1], [[1, 0, 0, 1, 100, 100], [0, 0, 1, 1]], ['c', 1, 1], []];
    const { placements } = placementsOf(fn, args, OPS);
    // a: the inner transform [50 0 0 -30 5 40] then the outer [2 0 0 2 10 20]: x from 20 to 120, y from 40 to 100 (flipped).
    expect(placements[0].box).toEqual({ x: 20, y: 40, width: 100, height: 60 });
    expect(placements[1].box).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(placements[2].box).toEqual({ x: 100, y: 100, width: 1, height: 1 });
  });

  it('takes an inline picture as it is, counts stencil masks and skips them', () => {
    const inline = { width: 30, height: 30, kind: 2, data: new Uint8Array(30 * 30 * 3) };
    const fn = [OPS.transform, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageMaskXObjectGroup];
    const args = [[100, 0, 0, 100, 0, 0], [inline], [], []];
    const { placements, masks } = placementsOf(fn, args, OPS);
    expect(placements).toHaveLength(1);
    expect(placements[0].inline).toBe(inline);
    expect(masks).toBe(2);
  });
});

describe('decoded pixels', () => {
  const kinds = pdfjs.ImageKind;

  it('reads RGB, RGBA and one-bit gray by the kind pdf.js gives', async () => {
    const rgb24 = await pixelsOf({ width: 2, height: 1, kind: kinds.RGB_24BPP, data: new Uint8Array([1, 2, 3, 4, 5, 6]) }, kinds);
    expect(rgb24).toMatchObject({ width: 2, height: 1, channels: 3 });
    const rgba = await pixelsOf({ width: 1, height: 1, kind: kinds.RGBA_32BPP, data: new Uint8ClampedArray([1, 2, 3, 255]) }, kinds);
    expect(rgba).toMatchObject({ channels: 4 });
    const gray = await pixelsOf({ width: 10, height: 2, kind: kinds.GRAYSCALE_1BPP, data: new Uint8Array([0b10101010, 0b11000000, 0b00000000, 0b01000000]) }, kinds);
    expect(gray!.channels).toBe(1);
    expect([...gray!.data.slice(0, 10)]).toEqual([255, 0, 255, 0, 255, 0, 255, 0, 255, 255]);
    expect([...gray!.data.slice(10, 20)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 255]);
  });

  it('refuses data too short for the size, an unknown kind and nothing at all', async () => {
    expect(await pixelsOf({ width: 4, height: 4, kind: kinds.RGB_24BPP, data: new Uint8Array(10) }, kinds)).toBeNull();
    expect(await pixelsOf({ width: 1, height: 1, kind: 9, data: new Uint8Array(4) }, kinds)).toBeNull();
    expect(await pixelsOf(null, kinds)).toBeNull();
    expect(await pixelsOf({ width: 0, height: 5, kind: kinds.RGB_24BPP, data: new Uint8Array(0) }, kinds)).toBeNull();
  });

  it('reads a bitmap through the reader it is given, and not at all without one', async () => {
    const bitmap = { width: 2, height: 1 };
    const out = await pixelsOf({ width: 2, height: 1, bitmap }, kinds, async () => ({ width: 2, height: 1, data: new Uint8ClampedArray(8).fill(7) }));
    expect(out).toMatchObject({ channels: 4, width: 2 });
    expect(await pixelsOf({ width: 2, height: 1, bitmap }, kinds)).toBeNull();
  });

  it('gives equal keys to equal pictures and different keys to different ones', () => {
    expect(pixelKey(4, 4, rgb(4, 4, 1))).toBe(pixelKey(4, 4, rgb(4, 4, 1)));
    expect(pixelKey(4, 4, rgb(4, 4, 1))).not.toBe(pixelKey(4, 4, rgb(4, 4, 2)));
    expect(pixelKey(4, 4, rgb(4, 4, 1))).not.toBe(pixelKey(2, 8, rgb(4, 4, 1)));
  });
});

describe('the PNG made from pixels', () => {
  it('reads back as the same picture: its size, no loss, for gray, RGB and RGBA', () => {
    for (const channels of [1, 3, 4] as const) {
      const width = 13;
      const height = 7;
      const data = new Uint8Array(width * height * channels).map((_, i) => (i * 31) & 255);
      const png = encodePng(width, height, channels, data);
      const info = inspectImage(png);
      expect(info.ok && [info.info.width, info.info.height, info.info.hasAlpha]).toEqual([width, height, channels === 4]);
      // The pixels: the data chunk inflated, one filter byte (0) in front of each row.
      const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
      let at = 8;
      const idat: Uint8Array[] = [];
      while (at < png.length) {
        const length = view.getUint32(at);
        const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
        if (type === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + length));
        at += 12 + length;
      }
      const lines = unzlibSync(idat[0]);
      const row = width * channels;
      for (let y = 0; y < height; y += 1) {
        expect(lines[y * (row + 1)]).toBe(0);
        expect([...lines.subarray(y * (row + 1) + 1, (y + 1) * (row + 1))]).toEqual([...data.subarray(y * row, (y + 1) * row)]);
      }
    }
  });

  it('refuses pixels that do not fill the picture', () => {
    expect(() => encodePng(10, 10, 3, new Uint8Array(5))).toThrow('do not fill');
  });
});

describe('decoration', () => {
  const found = (page: number, key: string, over: Partial<FoundPicture> = {}): FoundPicture => ({ page, key, width: 100, height: 100, box: { x: 0, y: 0, width: 100, height: 100 }, ...over });

  it('drops a picture that is on every page of a file of two or more pages', () => {
    const kept = dropDecorations([found(0, 'logo'), found(1, 'logo'), found(0, 'fig')], 2);
    expect(kept.map((f) => f.key)).toEqual(['fig']);
  });

  it('drops one that is on three or more pages, and keeps a figure used on two of four', () => {
    expect(dropDecorations([found(0, 'a'), found(1, 'a'), found(3, 'a')], 5)).toEqual([]);
    expect(dropDecorations([found(0, 'fig'), found(2, 'fig')], 4)).toHaveLength(2);
  });

  it('keeps the only picture of a one-page file', () => {
    expect(dropDecorations([found(0, 'only')], 1)).toHaveLength(1);
  });

  it('drops a picture that is tiny in pixels or on the page', () => {
    expect(dropDecorations([found(0, 'a', { width: 10 }), found(0, 'b', { height: 10 }), found(0, 'c', { box: { x: 0, y: 0, width: 10, height: 100 } }), found(0, 'd')], 3).map((f) => f.key)).toEqual(['d']);
  });
});

describe('the collector with a page that is not real', () => {
  const ops = pdfjs.OPS;
  const lib = { OPS: ops, ImageKind: pdfjs.ImageKind };
  const page = (count: number, side: number, offset = 0) => ({
    getOperatorList: async () => ({
      fnArray: Array.from({ length: count * 2 }, (_, i) => (i % 2 === 0 ? ops.transform : ops.paintImageXObject)),
      argsArray: Array.from({ length: count * 2 }, (_, i) => (i % 2 === 0 ? [100, 0, 0, 100, 0, 700 - (i / 2) * 3] : [`img_${(i - 1) / 2}`, side, side])),
    }),
    objs: { get: (id: string, callback: (object: unknown) => void) => callback({ width: side, height: side, kind: pdfjs.ImageKind.RGB_24BPP, data: rgb(side, side, Number(id.split('_')[1]) + offset) }) },
    commonObjs: { get: () => undefined },
  });

  it('keeps the first 100 pictures, leaves the rest out and says so', async () => {
    const collector = new PictureCollector(lib);
    await collector.addPage(0, page(MAX_PDF_PICTURES + 5, 30));
    const out = collector.finish(1);
    expect(out.pictures).toHaveLength(MAX_PDF_PICTURES);
    expect(out.perPage[0]).toHaveLength(MAX_PDF_PICTURES);
    expect(out.perPage[0][0].index).toBe(0);
    expect(out.notes).toEqual([`5 pictures were left out because the file has too many or they are too large (the limit is ${MAX_PDF_PICTURES} pictures).`]);
  });

  it('leaves out a picture over the pixel limit without decoding it into a PNG, and counts a picture it cannot read', async () => {
    const collector = new PictureCollector(lib);
    const huge = { width: Math.ceil(Math.sqrt(MAX_PDF_PICTURE_PIXELS)) + 1, height: Math.ceil(Math.sqrt(MAX_PDF_PICTURE_PIXELS)) + 1, kind: pdfjs.ImageKind.RGB_24BPP, data: new Uint8Array(3) };
    // The object claims a size its data does not have: that is unreadable, and one with enough data would be too large.
    await collector.addPage(0, {
      getOperatorList: async () => ({ fnArray: [ops.transform, ops.paintImageXObject, ops.transform, ops.paintImageXObject], argsArray: [[100, 0, 0, 100, 0, 500], ['a', 1, 1], [100, 0, 0, 100, 0, 300], ['b', 1, 1]] }),
      objs: { get: (id: string, callback: (object: unknown) => void) => callback(id === 'a' ? huge : null) },
      commonObjs: { get: () => undefined },
    });
    const out = collector.finish(1);
    expect(out.pictures).toEqual([]);
    expect(out.notes).toEqual(['2 pictures could not be read from the PDF.']);
  });

  it('numbers the pictures that stay in page order, with the top edge of each', async () => {
    const collector = new PictureCollector(lib);
    await collector.addPage(0, page(2, 30));
    await collector.addPage(1, page(1, 30, 50));
    const out = collector.finish(2);
    expect(out.perPage.map((p) => p.map((x) => x.index))).toEqual([[0, 1], [2]]);
    expect(out.perPage[0][0].top).toBe(800);
  });
});

describe('a PDF with pictures, read with the real pdf.js', () => {
  // Rows are 16 points apart from 760 down; a picture's top edge is its y plus its height.
  const LOGO = picture(500, 700, 60, 60, 9);
  const lines1 = [
    'Unit test', // 760
    '', // 744
    '1. Which tool is this?', // 728
    '', // 712
    '', // 696
    'A. A vice', // 680
    'B. A clamp', // 664
    'Answer: A', // 648
    '', // 632
    '', // 616
    '2. Which is stronger?', // 600
    'A. one', // 584
    'B. two', // 568
    'Answer: B', // 552
  ];
  const pictures1 = [
    picture(72, 690, 80, 50, 1), // top 740: between the title and question 1: no question yet
    picture(72, 640, 80, 60, 2), // top 700: under question 1's text, above its options
    picture(72, 560, 80, 75, 3), // top 635: after question 1's answer, above question 2
    picture(300, 600, 40, 20, 4, 10), // tiny in pixels: decoration
    LOGO,
  ];
  const lines2 = ['3. What is 3 + 4?', 'A. 6', 'B. 7', 'Answer: B'];

  it('places each picture where it stands, drops the logo that is on both pages and the tiny one, and reads the questions as before', async () => {
    const bytes = makePdf([lines1, lines2], [pictures1, [LOGO]]);
    const out = await questionsFromPdf(pdfjs, bytes, 'single');
    expect(out.questions.map((q) => q.text)).toEqual(['Which tool is this?', 'Which is stronger?', 'What is 3 + 4?']);
    expect(out.warnings.map((w) => w.message)).toEqual(['1 line before the first question (a title or instructions) was ignored.']);
    expect(out.images).toEqual([
      { index: 0, questionIndex: null, confidence: 'unassigned' },
      { index: 1, questionIndex: 0, confidence: 'clear' },
      { index: 2, questionIndex: 0, confidence: 'check' },
    ]);
    expect(out.pictures).toHaveLength(3);
    expect(out.pictures![1]).toMatchObject({ format: 'png', alt: '', cropped: false });
    const info = inspectImage(out.pictures![1].bytes!);
    expect(info.ok && [info.info.width, info.info.height]).toEqual([40, 40]);
  });

  it('makes a picture between the text of the second question and its options clear for that question', async () => {
    const out = await questionsFromPdf(pdfjs, makePdf([lines1], [[picture(72, 556, 80, 40, 5)]]), 'single');
    expect(out.images).toEqual([{ index: 0, questionIndex: 1, confidence: 'clear' }]);
  });

  it('gives a PDF without pictures exactly what it gave before', async () => {
    const out = await questionsFromPdf(pdfjs, makePdf([lines1]), 'single');
    expect(out.images).toBeUndefined();
    expect(out.pictures).toBeUndefined();
    expect(Object.keys(out)).toEqual(['questions', 'warnings', 'missingHeaders']);
  });

  it('refuses a PDF of pictures and no text as a scan, however many pictures it has', async () => {
    await expect(questionsFromPdf(pdfjs, makePdf([[''], ['']], [[picture(72, 300, 400, 400, 1)], [picture(72, 300, 400, 400, 2)]]), 'single')).rejects.toThrow('no text to read');
  });
});
