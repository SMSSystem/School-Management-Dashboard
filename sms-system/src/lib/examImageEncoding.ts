import {
  IMAGE_CAP_BYTES,
  IMAGE_CAP_CHARS,
  MAX_EDGE_PX,
  cleanImage,
  inspectImage,
  type ImageInfo,
  type ImageMime,
} from './examImage';

// A question's picture, which encoding to keep (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §5): the order of
// the ways to store it, the size a data URL comes to, what the builder says about it, and prepareBytes, which runs the
// whole check on a file's bytes. The bytes themselves (what a file is, taking the private parts out) are in examImage.ts.
// Pure and DOM-free, like it; the canvas that decodes and re-encodes is in examImageCanvas.ts.

// ── Which encoding to keep ──────────────────────────────────────────────────

export type EncodingStep = 'cleaned' | 'png' | 'reduced';

/** One way of storing the picture, with what it came to. The canvas module produces these in order and stops at the first that fits. */
export type EncodingCandidate = {
  step: EncodingStep;
  mime: ImageMime;
  bytes: number;
  /** The pixels are the source's (spec §5): true for the cleaned original and for the PNG of an exactly re-encodable source. */
  exact: boolean;
  width: number;
  height: number;
  /** For `reduced`: the quality used (0 to 1) and whether the picture was made smaller. */
  quality?: number;
  resized?: boolean;
};

/** The base64 data URL for bytes, built without the DOM. */
export function dataUrlOf(mime: ImageMime, bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(binary)}`;
}

/** The length of the data URL `bytes` bytes of this type make. */
export const dataUrlLength = (mime: ImageMime, bytes: number): number => `data:${mime};base64,`.length + 4 * Math.ceil(bytes / 3);

/** Does a picture of this size fit: at most IMAGE_CAP_BYTES, and a data URL of at most IMAGE_CAP_CHARS? */
export const fitsCap = (mime: ImageMime, bytes: number): boolean => bytes <= IMAGE_CAP_BYTES && dataUrlLength(mime, bytes) <= IMAGE_CAP_CHARS;

/** The qualities the visually lossless step tries, best first (the first one that fits is kept). */
export const lossyQualities = (): number[] => [0.95, 0.92, 0.9, 0.85, 0.8, 0.7, 0.6];

/** The size after making a picture fit `maxEdge` on its long side, never larger than it is. */
export function downscaleTo(width: number, height: number, maxEdge: number = MAX_EDGE_PX): { width: number; height: number; resized: boolean } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height, resized: false };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), resized: true };
}

/** The first candidate that fits, or null when none does (the picture is then refused: too large even reduced). */
export function pickEncoding(candidates: readonly EncodingCandidate[]): EncodingCandidate | null {
  return candidates.find((c) => fitsCap(c.mime, c.bytes)) ?? null;
}

export const TOO_LARGE_EVEN_REDUCED = 'This picture is too large even when reduced. Crop it or choose a simpler one.';

const sizeText = (bytes: number): string => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);

/** What the builder shows under a picture: its size and whether it was kept exactly or reduced. */
export function imageReport(c: EncodingCandidate): string {
  if (c.step === 'cleaned') return `${sizeText(c.bytes)}, kept exactly`;
  if (c.step === 'png') return `${sizeText(c.bytes)}, kept exactly (saved again as PNG)`;
  const quality = c.quality !== undefined ? `quality ${Math.round(c.quality * 100)}` : 'reduced';
  const size = c.resized ? `, resized to ${Math.max(c.width, c.height)} px` : '';
  return `${sizeText(c.bytes)}, reduced (${quality}${size})`;
}

// ── Choosing the encoding (the order of spec §5, with the canvas behind an interface) ──────────

/** What the canvas can do, so the order below is tested without a DOM. Each returns null when the browser cannot. */
export type Encoder = {
  /** The decoded pixels written as a PNG at their own size (the orientation applied). */
  png(): Promise<Uint8Array | null>;
  /** The pixels at `size` written as `mime` at `quality`; null when the browser cannot write that type. */
  lossy(mime: 'image/webp' | 'image/jpeg', quality: number, size: { width: number; height: number }): Promise<Uint8Array | null>;
};

export type ChosenEncoding = { candidate: EncodingCandidate; bytes: Uint8Array };

/** The size a picture is shown at: a phone photo turned by its orientation (5 to 8) is shown with width and height swapped. */
const shownSize = (info: Pick<ImageInfo, 'width' | 'height' | 'orientation'>): { width: number; height: number } =>
  info.orientation >= 5 ? { width: info.height, height: info.width } : { width: info.width, height: info.height };

/**
 * Stops at the first encoding that fits the cap: (1) the cleaned original, (2) a PNG of the pixels, only for a source the
 * canvas reproduces exactly, (3) WebP (JPEG when the browser cannot write WebP) at the best quality that fits, resized only
 * beyond MAX_EDGE_PX. Null when none fits. `cleaned` is `cleanImage(bytes, info.mime)`.
 */
export async function chooseEncodingFor(info: ImageInfo, cleaned: Uint8Array | null, encoder: Encoder): Promise<ChosenEncoding | null> {
  const shown = shownSize(info);
  if (cleaned) {
    const candidate: EncodingCandidate = { step: 'cleaned', mime: info.mime, bytes: cleaned.length, exact: true, width: shown.width, height: shown.height };
    if (pickEncoding([candidate])) return { candidate, bytes: cleaned };
  }
  if (info.canReencodeExactly) {
    const png = await encoder.png();
    if (png) {
      const candidate: EncodingCandidate = { step: 'png', mime: 'image/png', bytes: png.length, exact: true, width: shown.width, height: shown.height };
      if (pickEncoding([candidate])) return { candidate, bytes: png };
    }
  }
  const size = downscaleTo(shown.width, shown.height);
  let mime: 'image/webp' | 'image/jpeg' = 'image/webp';
  for (const quality of lossyQualities()) {
    let out = await encoder.lossy(mime, quality, size);
    if (!out && mime === 'image/webp') {
      mime = 'image/jpeg';
      out = await encoder.lossy(mime, quality, size);
    }
    if (!out) return null;
    const candidate: EncodingCandidate = { step: 'reduced', mime, bytes: out.length, exact: false, width: size.width, height: size.height, quality, resized: size.resized };
    if (pickEncoding([candidate])) return { candidate, bytes: out };
  }
  return null;
}

// ── The whole check, with the canvas behind an interface ───────────────────────────────────────

export const PICTURE_UNREADABLE = 'This picture could not be read. Choose another one.';

/** A picture as it will be stored (the builder's PreparedImage has the same fields, and an alt text it may add). */
export type PreparedPicture = {
  mime: ImageMime;
  /** The data URL. */
  data: string;
  bytes: number;
  w: number;
  h: number;
  exact: boolean;
  /** What the builder shows under it, such as "340 KB, kept exactly". */
  report: string;
};

/** What the picture check answers: the picture as it will be stored, or why it cannot be used. */
export type PrepareResult = { ok: true; picture: PreparedPicture } | { ok: false; message: string };

/**
 * The picture check without the DOM: what the file is (inspectImage), its private parts taken out (cleanImage), the first
 * encoding that fits (chooseEncodingFor), the data URL and the report line. `makeEncoder` is called only when the cleaned
 * original does not fit, so a Node test needs no canvas for a picture that does. Never throws.
 */
export async function prepareBytes(bytes: Uint8Array, makeEncoder: () => Encoder): Promise<PrepareResult> {
  try {
    const inspected = inspectImage(bytes);
    if (!inspected.ok) return { ok: false, message: inspected.message };
    const { info } = inspected;
    const cleaned = cleanImage(bytes, info.mime);
    if (!cleaned) return { ok: false, message: PICTURE_UNREADABLE };
    let encoder: Encoder | null = null;
    // The canvas is built from the original file, so the cleaned bytes and the decoded pixels agree.
    const lazy: Encoder = {
      png: () => (encoder ??= makeEncoder()).png(),
      lossy: (mime, quality, size) => (encoder ??= makeEncoder()).lossy(mime, quality, size),
    };
    const chosen = await chooseEncodingFor(info, cleaned, lazy);
    if (!chosen) return { ok: false, message: TOO_LARGE_EVEN_REDUCED };
    const { candidate } = chosen;
    return {
      ok: true,
      picture: {
        mime: candidate.mime,
        data: dataUrlOf(candidate.mime, chosen.bytes),
        bytes: candidate.bytes,
        w: candidate.width,
        h: candidate.height,
        exact: candidate.exact,
        report: imageReport(candidate),
      },
    };
  } catch {
    return { ok: false, message: PICTURE_UNREADABLE };
  }
}
