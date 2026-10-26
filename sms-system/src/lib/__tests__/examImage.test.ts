import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  IMAGE_CAP_BYTES,
  IMAGE_CAP_CHARS,
  MAX_EDGE_PX,
  MAX_PIXELS,
  MAX_SOURCE_BYTES,
  TOO_LARGE_EVEN_REDUCED,
  cleanImage,
  cleanJpeg,
  cleanPng,
  cleanWebp,
  crc32,
  dataUrlLength,
  dataUrlOf,
  downscaleTo,
  fitsCap,
  imageReport,
  inspectImage,
  lossyQualities,
  pickEncoding,
  type EncodingCandidate,
  type ImageInfo,
} from '../examImage';
import examImageRaw from '../examImage.ts?raw';
import {
  SCAN,
  TEXT_CHUNK,
  TIME_CHUNK,
  buildJpeg,
  buildPng,
  buildWebp,
  bytesOf,
  chunkData,
  chunkTypes,
  exifSegment,
  markersOf,
  orientationOf,
  scanlines,
} from './imageFixtures';

// A question's picture at the level of its bytes (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §5): what a file is, how its private
// parts come out without touching its pixels, which encoding to keep, and how it is reported. The files are built here.

const info = (r: ReturnType<typeof inspectImage>): ImageInfo => {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r.info;
};

describe('the caps', () => {
  it('are the numbers of the spec', () => {
    expect(IMAGE_CAP_BYTES).toBe(450 * 1024);
    expect(IMAGE_CAP_CHARS).toBe(600_000);
    expect(MAX_SOURCE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_PIXELS).toBe(24_000_000);
    expect(MAX_EDGE_PX).toBe(1600);
  });
});

describe('inspectImage', () => {
  it('reads a PNG: its size, alpha, depth and colour profile', () => {
    expect(info(inspectImage(buildPng({ width: 120, height: 80 })))).toMatchObject({
      mime: 'image/png', width: 120, height: 80, hasAlpha: false, bitDepth: 8, orientation: 1, hasIccProfile: false, canReencodeExactly: true,
    });
    expect(info(inspectImage(buildPng({ colorType: 6 })))).toMatchObject({ hasAlpha: true, canReencodeExactly: false });
    expect(info(inspectImage(buildPng({ colorType: 2, extra: [['tRNS', [0, 0, 0, 0, 0, 0]]] }))).hasAlpha).toBe(true);
    expect(info(inspectImage(buildPng({ extra: [['iCCP', [112, 0, 0, 1, 2, 3]]] }))).canReencodeExactly).toBe(false);
    expect(info(inspectImage(buildPng({ bitDepth: 16 }))).canReencodeExactly).toBe(false);
  });

  it('reads a JPEG: its size, depth, colour profile and the orientation in its EXIF', () => {
    expect(info(inspectImage(buildJpeg({ width: 200, height: 100 })))).toMatchObject({ mime: 'image/jpeg', width: 200, height: 100, bitDepth: 8, orientation: 1, canReencodeExactly: true });
    expect(info(inspectImage(buildJpeg({ exif: exifSegment(6) }))).orientation).toBe(6);
    expect(info(inspectImage(buildJpeg({ exif: exifSegment(8, false) }))).orientation).toBe(8);
    expect(info(inspectImage(buildJpeg({ icc: true }))).hasIccProfile).toBe(true);
    expect(info(inspectImage(buildJpeg({ precision: 12 }))).canReencodeExactly).toBe(false);
  });

  it('reads a WebP of each kind, with alpha, and refuses an animated one', () => {
    expect(info(inspectImage(buildWebp({ width: 90, height: 60, kind: 'VP8X' })))).toMatchObject({ mime: 'image/webp', width: 90, height: 60, hasAlpha: false });
    expect(info(inspectImage(buildWebp({ width: 33, height: 21, kind: 'VP8 ' })))).toMatchObject({ width: 33, height: 21 });
    expect(info(inspectImage(buildWebp({ width: 77, height: 55, kind: 'VP8L', alpha: true })))).toMatchObject({ width: 77, height: 55, hasAlpha: true });
    const animated = inspectImage(buildWebp({ animated: true }));
    expect(animated).toMatchObject({ ok: false, reason: 'animated' });
  });

  it('refuses a GIF, an SVG, a HEIC and anything else with a message that says what to do', () => {
    const gif = inspectImage(bytesOf([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]));
    expect(gif).toMatchObject({ ok: false, reason: 'unsupported' });
    expect(!gif.ok && gif.message).toContain('GIF');
    const svg = inspectImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
    expect(!svg.ok && svg.message).toContain('SVG');
    const heic = inspectImage(bytesOf([0, 0, 0, 24], [0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], new Array(16).fill(0)));
    expect(!heic.ok && heic.message).toContain('HEIC');
    const text = inspectImage(new TextEncoder().encode('hello'));
    expect(text).toMatchObject({ ok: false, reason: 'unsupported' });
  });

  it('refuses an animated PNG, a cut-short file and a renamed file that is not a picture', () => {
    expect(inspectImage(buildPng({ extra: [['acTL', [0, 0, 0, 2, 0, 0, 0, 0]]] }))).toMatchObject({ ok: false, reason: 'animated' });
    expect(inspectImage(buildPng({ noEnd: true }))).toMatchObject({ ok: false, reason: 'damaged' });
    expect(inspectImage(buildPng().subarray(0, 40))).toMatchObject({ ok: false, reason: 'damaged' });
    expect(inspectImage(buildJpeg().subarray(0, 30))).toMatchObject({ ok: false, reason: 'damaged' });
    expect(inspectImage(bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]))).toMatchObject({ ok: false, reason: 'damaged' });
  });

  it('refuses more than 24 million pixels and more than 10 MB, before anything is decoded', () => {
    expect(inspectImage(buildPng({ width: 6000, height: 4001, raw: new Uint8Array(8) }))).toMatchObject({ ok: false, reason: 'too_many_pixels' });
    expect(inspectImage(buildPng({ width: 6000, height: 4000, raw: new Uint8Array(8) })).ok).toBe(true);
    expect(inspectImage(buildJpeg({ width: 5000, height: 5000 }))).toMatchObject({ ok: false, reason: 'too_many_pixels' });
    const big = new Uint8Array(MAX_SOURCE_BYTES + 1);
    big.set(buildPng());
    expect(inspectImage(big)).toMatchObject({ ok: false, reason: 'too_large' });
  });
});

describe('cleanPng', () => {
  const dirty = buildPng({
    extra: [TEXT_CHUNK, TIME_CHUNK, ['gAMA', [0, 1, 134, 160]], ['sRGB', [0]], ['pHYs', [0, 0, 11, 19, 0, 0, 11, 19, 1]], ['eXIf', [77, 77, 0, 42]], ['tRNS', [0, 0, 0, 0, 0, 0]]],
    after: [['tEXt', [67, 0, 120]]],
  });

  it('drops text, time and other private chunks and keeps what draws or colours the picture', () => {
    const clean = cleanPng(dirty)!;
    expect(chunkTypes(dirty)).toContain('tEXt');
    expect(chunkTypes(clean)).toEqual(['IHDR', 'gAMA', 'sRGB', 'pHYs', 'tRNS', 'IDAT', 'IEND']);
  });

  it('leaves every pixel exactly as it was: the filtered scanlines are identical, only compressed better', () => {
    const clean = cleanPng(dirty)!;
    const before = unzlibSync(chunkData(dirty, 'IDAT')!);
    const after = unzlibSync(chunkData(clean, 'IDAT')!);
    expect(after).toEqual(before);
    expect(after).toEqual(scanlines(64, 48, 3));
    expect(chunkData(clean, 'IDAT')!.length).toBeLessThanOrEqual(chunkData(dirty, 'IDAT')!.length);
    expect(clean.length).toBeLessThan(dirty.length);
  });

  it('writes valid chunks: lengths and checksums are right, and the result is a picture again', () => {
    const clean = cleanPng(dirty)!;
    let at = 8;
    while (at < clean.length) {
      const length = ((clean[at] << 24) | (clean[at + 1] << 16) | (clean[at + 2] << 8) | clean[at + 3]) >>> 0;
      const crc = ((clean[at + 8 + length] << 24) | (clean[at + 9 + length] << 16) | (clean[at + 10 + length] << 8) | clean[at + 11 + length]) >>> 0;
      expect(crc32(clean.subarray(at + 4, at + 8 + length))).toBe(crc);
      at += 12 + length;
    }
    expect(at).toBe(clean.length);
    expect(inspectImage(clean).ok).toBe(true);
  });

  it('merges several IDAT chunks into one and keeps a file it cannot recompress as it is', () => {
    const interlaced = buildPng({ interlace: 1, raw: new Uint8Array(100) });
    expect(chunkTypes(cleanPng(interlaced)!)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const liar = buildPng({ raw: new Uint8Array(10) }); // far fewer scanlines than its header says
    expect(unzlibSync(chunkData(cleanPng(liar)!, 'IDAT')!)).toEqual(new Uint8Array(10));
  });

  it('returns null for a file that is not a whole PNG, and a bomb of scanlines is not inflated', () => {
    expect(cleanPng(buildPng({ noEnd: true }))).toBeNull();
    expect(cleanPng(new Uint8Array(5))).toBeNull();
    const bomb = buildPng({ width: 8, height: 8, raw: new Uint8Array(5_000_000), level: 9 });
    expect(unzlibSync(chunkData(cleanPng(bomb)!, 'IDAT')!)).toHaveLength(5_000_000);
  });
});

describe('cleanJpeg', () => {
  const dirty = buildJpeg({ exif: exifSegment(1), xmp: true, comment: true, icc: true, adobe: true });

  it('drops EXIF, XMP, the comment and the other APPn segments, and keeps JFIF, the profile, Adobe and the tables', () => {
    const clean = cleanJpeg(dirty)!;
    expect(markersOf(dirty)).toEqual(expect.arrayContaining([0xe1, 0xfe, 0xed]));
    const kept = markersOf(clean);
    expect(kept).toEqual([0xe0, 0xe2, 0xee, 0xdb, 0xc0, 0xc4, 0xda]);
    expect(kept).not.toContain(0xe1);
    expect(kept).not.toContain(0xfe);
  });

  it('leaves the scan data and everything after it byte for byte', () => {
    const clean = cleanJpeg(dirty)!;
    const tail = (b: Uint8Array) => b.subarray(b.length - (SCAN.length + 2 + 10));
    expect(tail(clean)).toEqual(tail(dirty));
    expect(clean.subarray(0, 2)).toEqual(bytesOf([0xff, 0xd8]));
    expect(clean.subarray(clean.length - 2)).toEqual(bytesOf([0xff, 0xd9]));
    expect(inspectImage(clean).ok).toBe(true);
  });

  it('keeps an orientation that is not 1 as a minimal EXIF, and writes none for 1 or for no EXIF', () => {
    for (const orientation of [3, 6, 8]) {
      const clean = cleanJpeg(buildJpeg({ exif: exifSegment(orientation) }))!;
      expect(orientationOf(clean)).toBe(orientation);
      expect(info(inspectImage(clean)).orientation).toBe(orientation);
      expect(new TextDecoder('latin1').decode(clean)).not.toContain('GPS');
    }
    expect(markersOf(cleanJpeg(buildJpeg({ exif: exifSegment(1) }))!)).not.toContain(0xe1);
    expect(markersOf(cleanJpeg(buildJpeg())!)).not.toContain(0xe1);
    expect(orientationOf(cleanJpeg(buildJpeg({ exif: exifSegment(6, false) }))!)).toBe(6);
  });

  it('is smaller than the original, does not grow a file with nothing to drop, and returns null for a bad file', () => {
    expect(cleanJpeg(dirty)!.length).toBeLessThan(dirty.length);
    const bare = buildJpeg();
    expect(cleanJpeg(bare)!.length).toBe(bare.length - 23); // only the Photoshop segment (APP13: 4 + 19 bytes) goes
    expect(cleanJpeg(bytesOf([0xff, 0xd8, 1, 2]))).toBeNull();
    expect(cleanJpeg(dirty.subarray(0, 40))).toBeNull();
  });
});

describe('cleanWebp', () => {
  it('drops the EXIF and XMP chunks, clears their flags, fixes the size and leaves the picture chunks', () => {
    const dirty = buildWebp({ exif: true, xmp: true });
    const clean = cleanWebp(dirty)!;
    const text = new TextDecoder('latin1').decode(clean);
    expect(new TextDecoder('latin1').decode(dirty)).toContain('EXIF');
    expect(text).not.toContain('EXIF');
    expect(text).not.toContain('XMP ');
    expect(text).toContain('VP8X');
    expect(text).toContain('VP8 ');
    expect(clean[20] & (0x08 | 0x04)).toBe(0);
    expect(new DataView(clean.buffer, clean.byteOffset).getUint32(4, true)).toBe(clean.length - 8);
    expect(info(inspectImage(clean))).toMatchObject({ width: 40, height: 30 });
  });

  it('returns null for a file that is not a whole WebP', () => {
    expect(cleanWebp(new Uint8Array(8))).toBeNull();
    expect(cleanWebp(buildWebp().subarray(0, 25))).toBeNull();
  });
});

describe('cleanImage', () => {
  it('uses the cleaner of the format', () => {
    expect(cleanImage(buildPng({ extra: [TEXT_CHUNK] }), 'image/png')).not.toBeNull();
    expect(cleanImage(buildJpeg({ comment: true }), 'image/jpeg')).not.toBeNull();
    expect(cleanImage(buildWebp({ exif: true }), 'image/webp')).not.toBeNull();
    expect(cleanImage(buildPng(), 'image/jpeg')).toBeNull();
  });
});

describe('dataUrlOf and the cap', () => {
  it('writes a base64 data URL that decodes to the same bytes, for any length', () => {
    for (const length of [0, 1, 2, 3, 100, 70_000]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 7) & 255);
      const url = dataUrlOf('image/png', bytes);
      expect(url.startsWith('data:image/png;base64,')).toBe(true);
      expect(url.length).toBe(dataUrlLength('image/png', length));
      expect(Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0))).toEqual(bytes);
    }
  });

  it('fits when the bytes and the characters are both under the cap', () => {
    expect(fitsCap('image/png', 1000)).toBe(true);
    expect(fitsCap('image/png', IMAGE_CAP_BYTES + 1)).toBe(false);
    // 450 KB is 614,400 characters of base64, over 600,000: the character cap is the one that bites
    expect(fitsCap('image/png', IMAGE_CAP_BYTES)).toBe(false);
    const largest = Math.floor((IMAGE_CAP_CHARS - 'data:image/png;base64,'.length) / 4) * 3;
    expect(fitsCap('image/png', largest)).toBe(true);
    expect(fitsCap('image/png', largest + 3)).toBe(false);
    expect(dataUrlLength('image/png', largest)).toBeLessThanOrEqual(IMAGE_CAP_CHARS);
  });
});

describe('choosing an encoding', () => {
  const c = (over: Partial<EncodingCandidate>): EncodingCandidate => ({ step: 'cleaned', mime: 'image/png', bytes: 1000, exact: true, width: 100, height: 80, ...over });

  it('keeps the first candidate that fits, so the cleaned original wins over a re-encode', () => {
    const picked = pickEncoding([c({ step: 'cleaned' }), c({ step: 'png', bytes: 500 })]);
    expect(picked?.step).toBe('cleaned');
  });

  it('goes on to the next when one does not fit, and says nothing fits when none does', () => {
    expect(pickEncoding([c({ step: 'cleaned', bytes: 900_000 }), c({ step: 'png', bytes: 500_000 }), c({ step: 'reduced', bytes: 100_000, exact: false, quality: 0.9 })])?.step).toBe('reduced');
    expect(pickEncoding([c({ bytes: 900_000 }), c({ step: 'reduced', bytes: 700_000, exact: false })])).toBeNull();
    expect(pickEncoding([])).toBeNull();
    expect(TOO_LARGE_EVEN_REDUCED).toContain('too large even when reduced');
  });

  it('tries the qualities best first and downsizes only past 1600 px, never making a picture larger', () => {
    expect(lossyQualities()).toEqual([0.95, 0.92, 0.9, 0.85, 0.8, 0.7, 0.6]);
    expect(downscaleTo(1600, 900)).toEqual({ width: 1600, height: 900, resized: false });
    expect(downscaleTo(800, 600)).toEqual({ width: 800, height: 600, resized: false });
    expect(downscaleTo(3200, 2400)).toEqual({ width: 1600, height: 1200, resized: true });
    expect(downscaleTo(1000, 4000, 1600)).toEqual({ width: 400, height: 1600, resized: true });
    expect(downscaleTo(1, 5000)).toEqual({ width: 1, height: 1600, resized: true });
  });
});

describe('imageReport', () => {
  const base: EncodingCandidate = { step: 'cleaned', mime: 'image/png', bytes: 340 * 1024, exact: true, width: 800, height: 600 };

  it('says kept exactly for the original and for a PNG saved again', () => {
    expect(imageReport(base)).toBe('340 KB, kept exactly');
    expect(imageReport({ ...base, step: 'png' })).toBe('340 KB, kept exactly (saved again as PNG)');
    expect(imageReport({ ...base, bytes: 512 })).toBe('512 B, kept exactly');
  });

  it('says reduced with the quality and the new size when it was made smaller', () => {
    expect(imageReport({ ...base, step: 'reduced', mime: 'image/webp', exact: false, quality: 0.9, width: 1600, height: 1200, resized: true })).toBe(
      '340 KB, reduced (quality 90, resized to 1600 px)',
    );
    expect(imageReport({ ...base, step: 'reduced', exact: false, quality: 0.85 })).toBe('340 KB, reduced (quality 85)');
  });
});

describe('the module', () => {
  it('is pure: no page, canvas, Firebase or React, and it imports only fflate and the sniffing it reuses', () => {
    const text = examImageRaw.split('\r\n').join('\n');
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect([...text.matchAll(/^import [\s\S]*? from '([^']+)';/gm)].map((m) => m[1])).toEqual(['fflate', './imageUpload']);
    for (const forbidden of ['document.', 'window.', 'canvas', 'createImageBitmap', 'firebase', 'react', 'Date.now']) {
      expect(code.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    }
  });
});
