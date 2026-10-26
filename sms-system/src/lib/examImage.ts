import { Unzlib, zlibSync } from 'fflate';
import { sniffImageType } from './imageUpload';

// A question's picture, at the level of its bytes (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §5): what a
// file is, how big it is, how to take the private parts out of it WITHOUT touching its pixels, which encodings to try when
// it is too large, and how to say what was done. Pure and DOM-free, so all of it is tested in Node; the canvas that decodes
// a picture and re-encodes it when it does not fit lives in examImageCanvas.ts, loaded only by the builder's image control.
// This module imports `fflate` (to recompress a PNG), so it is loaded lazily too.
//
// PNG, JPEG and WebP are accepted. A GIF, an animated PNG or WebP, an SVG, a HEIC and anything else is refused with a
// message that says what to do instead.

export const IMAGE_CAP_BYTES = 450 * 1024;
/** One stored data URL never passes this, so a picture always fits one pack document (spec §5 step 4). */
export const IMAGE_CAP_CHARS = 600_000;
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
/** A decompression-bomb and phone-memory guard: more pixels than this are refused before anything is decoded. */
export const MAX_PIXELS = 24_000_000;
/** A picture is made smaller only when it does not fit, and then only past this size on its long side. */
export const MAX_EDGE_PX = 1600;

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export type ImageInfo = {
  mime: ImageMime;
  width: number;
  height: number;
  hasAlpha: boolean;
  bitDepth: number;
  /** The EXIF orientation (1 to 8), 1 when there is none. */
  orientation: number;
  hasIccProfile: boolean;
  /** Opaque, 8 bits a channel and without a colour profile of its own: the canvas can save it as PNG with the same pixels. */
  canReencodeExactly: boolean;
};

export type ImageRefusalReason = 'unsupported' | 'too_large' | 'too_many_pixels' | 'animated' | 'damaged';
export type ImageRefusal = { reason: ImageRefusalReason; message: string };
export type InspectResult = { ok: true; info: ImageInfo } | ({ ok: false } & ImageRefusal);

const refuse = (reason: ImageRefusalReason, message: string): InspectResult => ({ ok: false, reason, message });

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const u32le = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ── PNG ─────────────────────────────────────────────────────────────────────

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let crcTable: Uint32Array | null = null;
/** The CRC-32 a PNG chunk ends with (fflate has none). Exported for the tests that build PNG files. */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

type PngChunk = { type: string; data: Uint8Array };

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** The chunks of a PNG up to and including IEND, or null when the file is cut short or has no IEND. */
function readPng(bytes: Uint8Array): PngChunk[] | null {
  if (bytes.length < 33 || !PNG_SIGNATURE.every((v, i) => bytes[i] === v)) return null;
  const chunks: PngChunk[] = [];
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = u32be(bytes, at);
    if (at + 12 + length > bytes.length) return null;
    const type = ascii(bytes, at + 4, 4);
    chunks.push({ type, data: bytes.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
    if (type === 'IEND') return chunks[0]?.type === 'IHDR' ? chunks : null;
  }
  return null;
}

const SAMPLES: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const PNG_KEPT = new Set(['IHDR', 'PLTE', 'tRNS', 'iCCP', 'sRGB', 'gAMA', 'cHRM', 'pHYs']);
const SPARE_ZLIB_BYTES = 1024;

/** The filtered scanlines of a non-interlaced PNG, inflated under a cap of what its header says they must be; null when they are not. */
function inflateIdat(idat: Uint8Array, expected: number): Uint8Array | null {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    const inflater = new Unzlib((chunk) => {
      total += chunk.length;
      chunks.push(chunk.slice());
    });
    const slice = 64 * 1024;
    for (let at = 0; at < idat.length; at += slice) {
      inflater.push(idat.subarray(at, at + slice), at + slice >= idat.length);
      if (total > expected + SPARE_ZLIB_BYTES) return null;
    }
  } catch {
    return null;
  }
  return total === expected ? concat(chunks) : null;
}

/**
 * The PNG without anything but what draws it: text, time, GPS-like and other ancillary chunks are dropped; the
 * transparency, palette and colour-profile chunks stay; the pixel data is recompressed at the best level, which leaves
 * the filtered scanlines (and so every pixel) exactly as they were. Null when the file is not a whole PNG.
 */
export function cleanPng(bytes: Uint8Array): Uint8Array | null {
  const chunks = readPng(bytes);
  if (!chunks) return null;
  const ihdr = chunks[0].data;
  if (ihdr.length !== 13) return null;
  const width = u32be(ihdr, 0);
  const height = u32be(ihdr, 4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlaced = ihdr[12] === 1;
  const idat = concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  let pixels = idat;
  const samples = SAMPLES[colorType];
  if (samples !== undefined && !interlaced && idat.length > 0) {
    const expected = height * (1 + Math.ceil((width * samples * bitDepth) / 8));
    const raw = expected <= 160 * 1024 * 1024 ? inflateIdat(idat, expected) : null;
    if (raw) {
      const again = zlibSync(raw, { level: 9 });
      if (again.length < idat.length) pixels = again;
    }
  }
  const out: Uint8Array[] = [new Uint8Array(PNG_SIGNATURE)];
  let wrotePixels = false;
  for (const chunk of chunks) {
    if (chunk.type === 'IDAT') {
      if (!wrotePixels) out.push(pngChunk('IDAT', pixels));
      wrotePixels = true;
    } else if (chunk.type === 'IEND') {
      out.push(pngChunk('IEND', new Uint8Array(0)));
    } else if (PNG_KEPT.has(chunk.type)) {
      out.push(pngChunk(chunk.type, chunk.data));
    }
  }
  return wrotePixels ? concat(out) : null;
}

function inspectPng(bytes: Uint8Array): InspectResult {
  const chunks = readPng(bytes);
  if (!chunks || chunks[0].data.length !== 13) return refuse('damaged', 'This picture is damaged or cut short. Save it again and choose it again.');
  const ihdr = chunks[0].data;
  const width = u32be(ihdr, 0);
  const height = u32be(ihdr, 4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  if (width === 0 || height === 0 || SAMPLES[colorType] === undefined) return refuse('damaged', 'This picture is damaged. Save it again and choose it again.');
  if (chunks.some((c) => c.type === 'acTL')) return refuse('animated', 'Animated pictures are not accepted. Save a still PNG or JPEG and choose that.');
  const hasAlpha = colorType === 4 || colorType === 6 || chunks.some((c) => c.type === 'tRNS');
  const hasIccProfile = chunks.some((c) => c.type === 'iCCP');
  return { ok: true, info: { mime: 'image/png', width, height, hasAlpha, bitDepth, orientation: 1, hasIccProfile, canReencodeExactly: !hasAlpha && bitDepth === 8 && !hasIccProfile } };
}

// ── JPEG ────────────────────────────────────────────────────────────────────

type JpegSegment = { marker: number; start: number; end: number };
type JpegParts = { segments: JpegSegment[]; tailStart: number; width: number; height: number; precision: number; orientation: number; hasIcc: boolean };

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** The EXIF orientation inside an APP1 segment's payload (after the length), 1 when there is none or it cannot be read. */
function exifOrientation(b: Uint8Array, from: number, to: number): number {
  if (to - from < 14 || ascii(b, from, 6) !== 'Exif\0\0') return 1;
  const tiff = from + 6;
  const little = ascii(b, tiff, 2) === 'II';
  const big = ascii(b, tiff, 2) === 'MM';
  if (!little && !big) return 1;
  const u16 = (o: number) => (little ? u16le(b, o) : u16be(b, o));
  const u32 = (o: number) => (little ? u32le(b, o) : u32be(b, o));
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > to) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > to) return 1;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

function parseJpeg(b: Uint8Array): JpegParts | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const segments: JpegSegment[] = [];
  let width = 0;
  let height = 0;
  let precision = 0;
  let orientation = 1;
  let hasIcc = false;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    let j = i + 1;
    while (j < b.length && b[j] === 0xff) j += 1;
    if (j >= b.length) return null;
    const marker = b[j];
    if (marker === 0xda) return width > 0 && height > 0 ? { segments, tailStart: j - 1, width, height, precision, orientation, hasIcc } : null;
    if (marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      segments.push({ marker, start: j + 1, end: j + 1 });
      i = j + 1;
      continue;
    }
    if (j + 2 >= b.length) return null;
    const length = u16be(b, j + 1);
    const end = j + 1 + length;
    if (length < 2 || end > b.length) return null;
    segments.push({ marker, start: j + 3, end });
    if (SOF.has(marker) && end - (j + 3) >= 6) {
      precision = b[j + 3];
      height = u16be(b, j + 4);
      width = u16be(b, j + 6);
    }
    if (marker === 0xe1 && orientation === 1) orientation = exifOrientation(b, j + 3, end);
    if (marker === 0xe2 && ascii(b, j + 3, 12) === 'ICC_PROFILE\0') hasIcc = true;
    i = end;
  }
  return null;
}

/** A tiny APP1 segment holding only the orientation, so a photo taken sideways is not shown sideways. */
function exifOrientationSegment(orientation: number): Uint8Array {
  const body = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF header, IFD at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT, 1
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ];
  const length = body.length + 2;
  return new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff, ...body]);
}

/**
 * The JPEG without its private parts: the comment, EXIF (GPS and camera), XMP and every other APPn segment are dropped,
 * and the scan data, tables, colour profile, JFIF and Adobe segments stay byte for byte, so the picture is not
 * re-encoded. A photo whose orientation is not 1 keeps a minimal EXIF holding only that. Null for a file that is not a
 * whole JPEG.
 */
export function cleanJpeg(bytes: Uint8Array): Uint8Array | null {
  const parts = parseJpeg(bytes);
  if (!parts) return null;
  const out: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  let orientationWritten = parts.orientation === 1;
  const writeOrientation = () => {
    if (!orientationWritten) out.push(exifOrientationSegment(parts.orientation));
    orientationWritten = true;
  };
  for (const s of parts.segments) {
    // the 0xFF before the marker, the marker, the two length bytes and the data
    const whole = (): Uint8Array => bytes.subarray(s.start - 4, s.end);
    if (s.marker === 0xe0 && ascii(bytes, s.start, 5) === 'JFIF\0') {
      out.push(whole());
      writeOrientation();
    } else if (s.marker === 0xe2 && ascii(bytes, s.start, 12) === 'ICC_PROFILE\0') {
      writeOrientation();
      out.push(whole());
    } else if (s.marker === 0xee && ascii(bytes, s.start, 5) === 'Adobe') {
      writeOrientation();
      out.push(whole());
    } else if (s.marker === 0xfe || (s.marker >= 0xe0 && s.marker <= 0xef)) {
      // dropped
    } else if (s.start === s.end) {
      out.push(new Uint8Array([0xff, s.marker]));
    } else {
      writeOrientation();
      out.push(whole());
    }
  }
  writeOrientation();
  out.push(bytes.subarray(parts.tailStart));
  return concat(out);
}

function inspectJpeg(bytes: Uint8Array): InspectResult {
  const parts = parseJpeg(bytes);
  if (!parts) return refuse('damaged', 'This picture is damaged or cut short. Save it again and choose it again.');
  return {
    ok: true,
    info: {
      mime: 'image/jpeg',
      width: parts.width,
      height: parts.height,
      hasAlpha: false,
      bitDepth: parts.precision,
      orientation: parts.orientation,
      hasIccProfile: parts.hasIcc,
      canReencodeExactly: parts.precision === 8 && !parts.hasIcc,
    },
  };
}

// ── WebP ────────────────────────────────────────────────────────────────────

type WebpChunk = { type: string; start: number; size: number };

function readWebp(b: Uint8Array): WebpChunk[] | null {
  if (b.length < 20 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunks: WebpChunk[] = [];
  let at = 12;
  while (at + 8 <= b.length) {
    const size = u32le(b, at + 4);
    if (at + 8 + size > b.length) return null;
    chunks.push({ type: ascii(b, at, 4), start: at + 8, size });
    at += 8 + size + (size & 1);
  }
  return chunks.length > 0 ? chunks : null;
}

function inspectWebp(bytes: Uint8Array): InspectResult {
  const chunks = readWebp(bytes);
  const damaged = refuse('damaged', 'This picture is damaged or cut short. Save it again and choose it again.');
  if (!chunks) return damaged;
  let width = 0;
  let height = 0;
  let hasAlpha = false;
  let hasIccProfile = false;
  for (const c of chunks) {
    if (c.type === 'VP8X' && c.size >= 10) {
      if (bytes[c.start] & 0x02) return refuse('animated', 'Animated pictures are not accepted. Save a still PNG or JPEG and choose that.');
      hasAlpha = (bytes[c.start] & 0x10) !== 0;
      hasIccProfile = (bytes[c.start] & 0x20) !== 0;
      width = 1 + u24le(bytes, c.start + 4);
      height = 1 + u24le(bytes, c.start + 7);
    } else if (c.type === 'VP8 ' && c.size >= 10 && width === 0) {
      width = u16le(bytes, c.start + 6) & 0x3fff;
      height = u16le(bytes, c.start + 8) & 0x3fff;
    } else if (c.type === 'VP8L' && c.size >= 5 && width === 0) {
      const bits = u32le(bytes, c.start + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
      hasAlpha = ((bits >>> 28) & 1) === 1;
    } else if (c.type === 'ALPH') {
      hasAlpha = true;
    } else if (c.type === 'ICCP') {
      hasIccProfile = true;
    }
  }
  if (width === 0 || height === 0) return damaged;
  return { ok: true, info: { mime: 'image/webp', width, height, hasAlpha, bitDepth: 8, orientation: 1, hasIccProfile, canReencodeExactly: !hasAlpha && !hasIccProfile } };
}

/** The WebP without its EXIF and XMP chunks (the flags of its extended header follow); the picture chunks are untouched. */
export function cleanWebp(bytes: Uint8Array): Uint8Array | null {
  const chunks = readWebp(bytes);
  if (!chunks) return null;
  const kept = chunks.filter((c) => c.type !== 'EXIF' && c.type !== 'XMP ');
  const body: Uint8Array[] = [];
  for (const c of kept) {
    const data = bytes.slice(c.start, c.start + c.size);
    if (c.type === 'VP8X' && data.length > 0) data[0] &= ~(0x08 | 0x04);
    const head = new Uint8Array(8);
    for (let i = 0; i < 4; i += 1) head[i] = c.type.charCodeAt(i);
    new DataView(head.buffer).setUint32(4, c.size, true);
    body.push(head, data, new Uint8Array(c.size & 1));
  }
  const inner = concat(body);
  const out = new Uint8Array(12 + inner.length);
  out.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(out.buffer).setUint32(4, 4 + inner.length, true);
  out.set([0x57, 0x45, 0x42, 0x50], 8);
  out.set(inner, 12);
  return out;
}

// ── What a file is ──────────────────────────────────────────────────────────

/** What the bytes are, or why they cannot be used: the format, the size, the pixels, an animation. Nothing is decoded. */
export function inspectImage(bytes: Uint8Array): InspectResult {
  if (bytes.length > MAX_SOURCE_BYTES) return refuse('too_large', 'This picture is larger than 10 MB. Choose a smaller one.');
  const mime = sniffImageType(bytes);
  if (mime === null) {
    if (ascii(bytes, 0, 4) === 'GIF8') return refuse('unsupported', 'GIF pictures are not accepted. Save a still PNG or JPEG and choose that.');
    if (/^\s*(<\?xml|<svg)/i.test(ascii(bytes, 0, 64))) return refuse('unsupported', 'SVG pictures are not accepted. Save a PNG or JPEG and choose that.');
    if (ascii(bytes, 4, 4) === 'ftyp') return refuse('unsupported', 'HEIC pictures are not accepted. Save it as a JPEG or PNG and choose that.');
    return refuse('unsupported', 'Choose a PNG, JPEG or WebP picture.');
  }
  const result = mime === 'image/png' ? inspectPng(bytes) : mime === 'image/jpeg' ? inspectJpeg(bytes) : inspectWebp(bytes);
  if (result.ok && result.info.width * result.info.height > MAX_PIXELS) {
    return refuse('too_many_pixels', 'This picture has too many pixels (more than 24 million). Choose a smaller one.');
  }
  return result;
}

/** The picture without its private parts and with its pixels untouched; null when the bytes are not a whole picture. */
export function cleanImage(bytes: Uint8Array, mime: ImageMime): Uint8Array | null {
  return mime === 'image/png' ? cleanPng(bytes) : mime === 'image/jpeg' ? cleanJpeg(bytes) : cleanWebp(bytes);
}

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
