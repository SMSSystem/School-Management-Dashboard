import { encodePng } from './examImage';
import type { ImportPicture } from './examImportPictures';
import type { PagePicture } from './pdfLines';

// The pictures a PDF paints on its pages (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.2). pdf.js reports each
// page as a list of drawing operations; the ones that matter here are the transform that places a picture, the picture's
// paint and, for the position, the save and restore around them. The decoded pixels become a lossless PNG at once (so only
// the compressed picture is kept), and where the picture stands (the top edge, in PDF units) is what the text lines are
// compared with: pdfLines.ts puts a marker line at that place and the question parser does the rest. A repeated picture
// (a logo on every page) and a tiny one (a bullet, a rule) are decoration and are dropped. A picture that is only a one-colour
// stencil is not read. No pdf.js is imported here: the library is passed in, and the tests give it fake operator lists.

/** The most pictures one file gives, the most pixels in one picture, and the most pixels decoded in all. */
export const MAX_PDF_PICTURES = 100;
export const MAX_PDF_PICTURE_PIXELS = 16_000_000;
const MAX_PDF_TOTAL_PIXELS = 120_000_000;
/** More pictures than this on the pages and the rest are not even decoded (the first 100 that stay are kept). */
const MAX_PDF_FOUND = 400;
/** A picture smaller than this on either side is decoration: pixels in the picture, points on the page. */
const MIN_PIXELS = 24;
const MIN_POINTS = 20;
const WAIT_FOR_OBJECT_MS = 8000;

export type PdfOps = Readonly<Record<string, number>>;
export type PdfBox = { x: number; y: number; width: number; height: number };
export type PdfImageObject = {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray | null;
  bitmap?: unknown;
};
/** A decoded picture: 1 (gray), 3 (RGB) or 4 (RGBA) channels of 8 bits. */
export type Pixels = { width: number; height: number; channels: 1 | 3 | 4; data: Uint8Array };
/** Reads an ImageBitmap (a browser object) into RGBA pixels; absent where there is no browser. */
export type BitmapReader = (bitmap: unknown) => Promise<{ width: number; height: number; data: Uint8Array | Uint8ClampedArray } | null>;

export type Placement = { id: string | null; inline: PdfImageObject | null; box: PdfBox };

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `m` applied first, then `ctm` (the order PDF concatenates a transform in). */
function multiply(m: Matrix, ctm: Matrix): Matrix {
  return [
    m[0] * ctm[0] + m[1] * ctm[2],
    m[0] * ctm[1] + m[1] * ctm[3],
    m[2] * ctm[0] + m[3] * ctm[2],
    m[2] * ctm[1] + m[3] * ctm[3],
    m[4] * ctm[0] + m[5] * ctm[2] + ctm[4],
    m[4] * ctm[1] + m[5] * ctm[3] + ctm[5],
  ];
}

const isMatrix = (value: unknown): value is Matrix => Array.isArray(value) && value.length === 6 && value.every((n) => typeof n === 'number' && Number.isFinite(n));

/** The page box the unit square of a picture covers under a transform (the bounding box when it is turned or flipped). */
function boxOf(m: Matrix): PdfBox {
  const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
  const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * Where each picture of a page is painted, in the order it is painted, from pdf.js's operator list: a transform stack
 * (`save`, `restore`, `transform`, and the begin and end of a form) gives the placing of every `paintImageXObject` and
 * `paintInlineImageXObject`. A stencil mask (`paintImageMask…`) is counted and skipped.
 */
export function placementsOf(
  fnArray: ArrayLike<number>,
  argsArray: ArrayLike<unknown>,
  ops: PdfOps,
): { placements: Placement[]; masks: number } {
  const placements: Placement[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  let masks = 0;
  const maskOps = new Set([ops.paintImageMaskXObject, ops.paintImageMaskXObjectGroup, ops.paintImageMaskXObjectRepeat, ops.paintSolidColorImageMask]);
  for (let i = 0; i < fnArray.length; i += 1) {
    const fn = fnArray[i];
    const args = (argsArray[i] ?? []) as unknown[];
    if (fn === ops.save) {
      stack.push(ctm);
    } else if (fn === ops.restore) {
      ctm = stack.pop() ?? ctm;
    } else if (fn === ops.transform) {
      if (isMatrix(args)) ctm = multiply(args, ctm);
    } else if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm);
      if (isMatrix(args[0])) ctm = multiply(args[0], ctm);
    } else if (fn === ops.paintFormXObjectEnd) {
      ctm = stack.pop() ?? ctm;
    } else if (fn === ops.paintImageXObject) {
      if (typeof args[0] === 'string') placements.push({ id: args[0], inline: null, box: boxOf(ctm) });
    } else if (fn === ops.paintInlineImageXObject) {
      const inline = args[0] as PdfImageObject | undefined;
      if (inline && typeof inline.width === 'number') placements.push({ id: null, inline, box: boxOf(ctm) });
    } else if (maskOps.has(fn)) {
      masks += 1;
    }
  }
  return { placements, masks };
}

/**
 * The pixels of a picture pdf.js decoded: by its `kind` (1 = one bit gray, 2 = RGB, 3 = RGBA) from `data`, or, for an
 * `ImageBitmap` (a browser may hand one over instead), through `readBitmap`. Null when it can not be read.
 */
export async function pixelsOf(object: PdfImageObject | null | undefined, kinds: Readonly<Record<string, number>>, readBitmap?: BitmapReader): Promise<Pixels | null> {
  if (!object || !(object.width > 0) || !(object.height > 0)) return null;
  const { width, height } = object;
  if (object.data) {
    const data = new Uint8Array(object.data.buffer, object.data.byteOffset, object.data.length);
    if (object.kind === kinds.RGB_24BPP && data.length >= width * height * 3) return { width, height, channels: 3, data };
    if (object.kind === kinds.RGBA_32BPP && data.length >= width * height * 4) return { width, height, channels: 4, data };
    if (object.kind === kinds.GRAYSCALE_1BPP) {
      const row = Math.ceil(width / 8);
      if (data.length < row * height) return null;
      const out = new Uint8Array(width * height);
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) out[y * width + x] = (data[y * row + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
      return { width, height, channels: 1, data: out };
    }
    return null;
  }
  if (object.bitmap && readBitmap) {
    const read = await readBitmap(object.bitmap);
    if (!read || read.data.length < read.width * read.height * 4) return null;
    return { width: read.width, height: read.height, channels: 4, data: new Uint8Array(read.data.buffer, read.data.byteOffset, read.data.length) };
  }
  return null;
}

/** A key that is equal for equal pictures (size and a 64-bit hash of every byte), to find a picture repeated on pages. */
export function pixelKey(width: number, height: number, data: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < data.length; i += 1) {
    h1 = Math.imul(h1 ^ data[i], 0x01000193);
    h2 = Math.imul(h2 + data[i] + 1, 0x85ebca6b) ^ (h2 >>> 15);
  }
  return `${width}x${height}:${data.length}:${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

export type FoundPicture = { page: number; key: string; width: number; height: number; box: PdfBox };

/**
 * Drops decoration: a picture that is small (under 24 pixels or 20 points on a side), and a picture whose content is on
 * every page of a file of two pages or more, or on three or more pages (a logo, a header rule, a watermark). A figure used
 * twice in a longer paper stays.
 */
export function dropDecorations<T extends FoundPicture>(found: readonly T[], pageCount: number): T[] {
  const pagesByKey = new Map<string, Set<number>>();
  for (const f of found) {
    const pages = pagesByKey.get(f.key) ?? new Set<number>();
    pages.add(f.page);
    pagesByKey.set(f.key, pages);
  }
  return found.filter((f) => {
    if (f.width < MIN_PIXELS || f.height < MIN_PIXELS || f.box.width < MIN_POINTS || f.box.height < MIN_POINTS) return false;
    const onPages = pagesByKey.get(f.key)?.size ?? 0;
    return !((pageCount >= 2 && onPages >= pageCount) || onPages >= 3);
  });
}

type PdfPageLike = {
  getOperatorList(): Promise<{ fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }>;
  objs: { get(id: string, callback: (object: unknown) => void): unknown };
  commonObjs: { get(id: string, callback: (object: unknown) => void): unknown };
};

/** The decoded object for an id, from the page's objects (or the document's common ones); null if it does not come. */
function objectFor(page: PdfPageLike, id: string): Promise<PdfImageObject | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), WAIT_FOR_OBJECT_MS);
    const done = (object: unknown) => {
      clearTimeout(timer);
      resolve((object as PdfImageObject | null) ?? null);
    };
    try {
      (id.startsWith('g_') ? page.commonObjs : page.objs).get(id, done);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

type Held = FoundPicture & { png: Uint8Array };

/**
 * Collects the pictures of a PDF page by page (the caller reads the pages), turning each into a PNG at once. `finish`
 * drops the decoration, keeps the first 100, and numbers the pictures; it also says what was left out.
 */
export class PictureCollector {
  private readonly held: Held[] = [];
  private masks = 0;
  private unreadable = 0;
  private leftOut = 0;
  private pixels = 0;

  constructor(
    private readonly lib: { OPS: PdfOps; ImageKind: Readonly<Record<string, number>> },
    private readonly readBitmap?: BitmapReader,
  ) {}

  async addPage(pageIndex: number, page: PdfPageLike): Promise<void> {
    const list = await page.getOperatorList();
    const { placements, masks } = placementsOf(list.fnArray, list.argsArray, this.lib.OPS);
    this.masks += masks;
    for (const placement of placements) {
      if (placement.box.width < MIN_POINTS || placement.box.height < MIN_POINTS) continue;
      if (this.held.length >= MAX_PDF_FOUND) {
        this.leftOut += 1;
        continue;
      }
      const object = placement.inline ?? (placement.id ? await objectFor(page, placement.id) : null);
      const pixels = await pixelsOf(object, this.lib.ImageKind, this.readBitmap);
      if (!pixels) {
        this.unreadable += 1;
        continue;
      }
      if (pixels.width < MIN_PIXELS || pixels.height < MIN_PIXELS) continue;
      const count = pixels.width * pixels.height;
      if (count > MAX_PDF_PICTURE_PIXELS || this.pixels + count > MAX_PDF_TOTAL_PIXELS) {
        this.leftOut += 1;
        continue;
      }
      this.pixels += count;
      this.held.push({
        page: pageIndex,
        key: pixelKey(pixels.width, pixels.height, pixels.data),
        width: pixels.width,
        height: pixels.height,
        box: placement.box,
        png: encodePng(pixels.width, pixels.height, pixels.channels, pixels.data),
      });
    }
  }

  finish(pageCount: number): { pictures: ImportPicture[]; perPage: PagePicture[][]; notes: string[] } {
    const kept = dropDecorations(this.held, pageCount);
    const used = kept.slice(0, MAX_PDF_PICTURES);
    const leftOut = this.leftOut + (kept.length - used.length);
    const perPage: PagePicture[][] = Array.from({ length: pageCount }, () => []);
    used.forEach((picture, index) => perPage[picture.page]?.push({ top: picture.box.y + picture.box.height, index }));
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const notes: string[] = [];
    if (this.masks > 0) notes.push(`${plural(this.masks, 'image drawn as a one-colour stencil was', 'images drawn as one-colour stencils were')} ignored.`);
    if (this.unreadable > 0) notes.push(`${plural(this.unreadable, 'picture', 'pictures')} could not be read from the PDF.`);
    if (leftOut > 0) notes.push(`${plural(leftOut, 'picture was', 'pictures were')} left out because the file has too many or they are too large (the limit is ${MAX_PDF_PICTURES} pictures).`);
    return {
      pictures: used.map((picture): ImportPicture => ({ bytes: picture.png, format: 'png', alt: '', cropped: false })),
      perPage,
      notes,
    };
  }
}
