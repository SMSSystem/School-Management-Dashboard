import { zlibSync } from 'fflate';
import { crc32 } from '../examImage';

// Small picture files built from bytes, for the tests of the image modules: no files on disk, every field chosen by the
// test. Not a test file itself.

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
export const bytesOf = (...parts: (number[] | Uint8Array)[]): Uint8Array => Uint8Array.from(parts.flatMap((p) => [...p]));

export function pngChunkBytes(type: string, data: number[] | Uint8Array): Uint8Array {
  const body = [...text(type), ...data];
  return bytesOf(be32(data.length), body, be32(crc32(Uint8Array.from(body))));
}

/** The filtered scanlines of a w x h picture: a gradient with long runs, so a better level of compression is smaller. */
export function scanlines(width: number, height: number, samples: number, bitDepth = 8): Uint8Array {
  const row = 1 + Math.ceil((width * samples * bitDepth) / 8);
  const out = new Uint8Array(row * height);
  for (let y = 0; y < height; y += 1) for (let x = 1; x < row; x += 1) out[y * row + x] = (Math.floor(x / 3) + y * 2) & 255;
  return out;
}

const SAMPLES: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export type PngOptions = {
  width?: number;
  height?: number;
  colorType?: number;
  bitDepth?: number;
  interlace?: number;
  /** Chunks written between IHDR and IDAT, as [type, data]. */
  extra?: [string, number[]][];
  /** Replaces the raw scanlines (to build a file that lies about its size). */
  raw?: Uint8Array;
  /** The level the test file's IDAT was compressed at (1 by default, so the cleaner can do better). */
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  /** Written after IDAT, before IEND. */
  after?: [string, number[]][];
  /** Leave the file without its IEND (a cut-short file). */
  noEnd?: boolean;
};

export function buildPng(o: PngOptions = {}): Uint8Array {
  const width = o.width ?? 64;
  const height = o.height ?? 48;
  const colorType = o.colorType ?? 2;
  const bitDepth = o.bitDepth ?? 8;
  const raw = o.raw ?? scanlines(width, height, SAMPLES[colorType], bitDepth);
  const parts: Uint8Array[] = [
    bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunkBytes('IHDR', [...be32(width), ...be32(height), bitDepth, colorType, 0, 0, o.interlace ?? 0]),
    ...(o.extra ?? []).map(([t, d]) => pngChunkBytes(t, d)),
    pngChunkBytes('IDAT', zlibSync(raw, { level: o.level ?? 1 })),
    ...(o.after ?? []).map(([t, d]) => pngChunkBytes(t, d)),
  ];
  if (!o.noEnd) parts.push(pngChunkBytes('IEND', []));
  return bytesOf(...parts);
}

export const TEXT_CHUNK = ['tEXt', text('Comment\0taken at 18.0123 N, 77.5 W')] as [string, number[]];
export const TIME_CHUNK = ['tIME', [7, 234, 10, 22, 13, 5, 9]] as [string, number[]];

/** The chunk types of a PNG file, in order. */
export function chunkTypes(png: Uint8Array): string[] {
  const types: string[] = [];
  let at = 8;
  while (at + 8 <= png.length) {
    const length = ((png[at] << 24) | (png[at + 1] << 16) | (png[at + 2] << 8) | png[at + 3]) >>> 0;
    types.push(String.fromCharCode(...png.subarray(at + 4, at + 8)));
    at += 12 + length;
  }
  return types;
}

/** The data of the first chunk of a type. */
export function chunkData(png: Uint8Array, type: string): Uint8Array | null {
  let at = 8;
  while (at + 8 <= png.length) {
    const length = ((png[at] << 24) | (png[at + 1] << 16) | (png[at + 2] << 8) | png[at + 3]) >>> 0;
    if (String.fromCharCode(...png.subarray(at + 4, at + 8)) === type) return png.subarray(at + 8, at + 8 + length);
    at += 12 + length;
  }
  return null;
}

/** An APP1 segment holding EXIF with an orientation, a camera name and GPS-like text. */
export function exifSegment(orientation: number, big = true): Uint8Array {
  const tiff = big
    ? [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]
    : [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0];
  const body = [...text('Exif\0\0'), ...tiff, ...text('GPS 18.0123N 77.5W Pixel 9')];
  return bytesOf([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255], body);
}

export function segment(marker: number, body: number[] | Uint8Array): Uint8Array {
  return bytesOf([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255], body);
}

export type JpegOptions = {
  width?: number;
  height?: number;
  precision?: number;
  jfif?: boolean;
  exif?: Uint8Array | null;
  comment?: boolean;
  xmp?: boolean;
  icc?: boolean;
  adobe?: boolean;
  /** The bytes of the scan, after the SOS header. */
  scan?: number[];
};

export const SCAN = [0x12, 0x34, 0x56, 0x78, 0xff, 0x00, 0x9a, 0xbc, 0xde, 0xf0, 0x11, 0x22];

export function buildJpeg(o: JpegOptions = {}): Uint8Array {
  const width = o.width ?? 64;
  const height = o.height ?? 48;
  const parts: Uint8Array[] = [bytesOf([0xff, 0xd8])];
  if (o.jfif !== false) parts.push(segment(0xe0, [...text('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]));
  if (o.exif) parts.push(o.exif);
  if (o.xmp) parts.push(segment(0xe1, text('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>photographer</x:xmpmeta>')));
  if (o.comment) parts.push(segment(0xfe, text('shot at home')));
  if (o.icc) parts.push(segment(0xe2, [...text('ICC_PROFILE\0'), 1, 1, 1, 2, 3, 4]));
  if (o.adobe) parts.push(segment(0xee, [...text('Adobe'), 0, 100, 0, 0, 0, 0, 1]));
  parts.push(segment(0xed, text('Photoshop 3.0\0 8BIM')));
  parts.push(segment(0xdb, [0, ...Array.from({ length: 64 }, (_, i) => 8 + (i % 5))]));
  parts.push(segment(o.precision && o.precision !== 8 ? 0xc0 : 0xc0, [o.precision ?? 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0]));
  parts.push(segment(0xc4, [0x00, ...Array.from({ length: 16 }, (_, i) => (i === 0 ? 1 : 0)), 0]));
  parts.push(bytesOf([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00], o.scan ?? SCAN, [0xff, 0xd9]));
  return bytesOf(...parts);
}

/** The orientation the cleaned file declares (1 when it has no EXIF). */
export function orientationOf(jpeg: Uint8Array): number {
  for (let i = 2; i + 4 < jpeg.length; ) {
    if (jpeg[i] !== 0xff) return 1;
    const marker = jpeg[i + 1];
    if (marker === 0xda) return 1;
    const length = (jpeg[i + 2] << 8) | jpeg[i + 3];
    if (marker === 0xe1 && String.fromCharCode(...jpeg.subarray(i + 4, i + 8)) === 'Exif') {
      const tiff = i + 10;
      const little = jpeg[tiff] === 0x49;
      const entries = little ? jpeg[tiff + 8] | (jpeg[tiff + 9] << 8) : (jpeg[tiff + 8] << 8) | jpeg[tiff + 9];
      for (let n = 0; n < entries; n += 1) {
        const e = tiff + 10 + n * 12;
        const tag = little ? jpeg[e] | (jpeg[e + 1] << 8) : (jpeg[e] << 8) | jpeg[e + 1];
        if (tag === 0x0112) return little ? jpeg[e + 8] | (jpeg[e + 9] << 8) : (jpeg[e + 8] << 8) | jpeg[e + 9];
      }
    }
    i += 2 + length;
  }
  return 1;
}

/** The marker bytes of the segments of a JPEG up to its scan (0xE0, 0xE2 …). */
export function markersOf(jpeg: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 2; i + 4 < jpeg.length; ) {
    out.push(jpeg[i + 1]);
    if (jpeg[i + 1] === 0xda) break;
    i += 2 + ((jpeg[i + 2] << 8) | jpeg[i + 3]);
  }
  return out;
}

const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const riffChunk = (type: string, data: number[]) => [...text(type), ...le32(data.length), ...data, ...(data.length & 1 ? [0] : [])];

export type WebpOptions = { width?: number; height?: number; kind?: 'VP8 ' | 'VP8L' | 'VP8X'; exif?: boolean; xmp?: boolean; alpha?: boolean; animated?: boolean };

export function buildWebp(o: WebpOptions = {}): Uint8Array {
  const width = o.width ?? 40;
  const height = o.height ?? 30;
  const kind = o.kind ?? 'VP8X';
  const body: number[] = [];
  if (kind === 'VP8X') {
    const flags = (o.alpha ? 0x10 : 0) | (o.animated ? 0x02 : 0) | (o.exif ? 0x08 : 0) | (o.xmp ? 0x04 : 0);
    body.push(...riffChunk('VP8X', [flags, 0, 0, 0, (width - 1) & 255, ((width - 1) >> 8) & 255, ((width - 1) >> 16) & 255, (height - 1) & 255, ((height - 1) >> 8) & 255, ((height - 1) >> 16) & 255]));
    body.push(...riffChunk('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, width & 255, width >> 8, height & 255, height >> 8, 1, 2, 3]));
  } else if (kind === 'VP8L') {
    const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14) | ((o.alpha ? 1 : 0) << 28);
    body.push(...riffChunk('VP8L', [0x2f, ...le32(bits), 9, 9, 9]));
  } else {
    body.push(...riffChunk('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, width & 255, width >> 8, height & 255, height >> 8, 1, 2, 3]));
  }
  if (o.exif) body.push(...riffChunk('EXIF', text('Exif\0\0GPS 18.0N')));
  if (o.xmp) body.push(...riffChunk('XMP ', text('<x:xmpmeta/>')));
  return bytesOf(text('RIFF'), le32(4 + body.length), text('WEBP'), body);
}
