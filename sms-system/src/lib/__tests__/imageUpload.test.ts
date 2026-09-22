import { describe, it, expect } from 'vitest';
import {
  sniffImageType,
  processPhotoUpload,
  PhotoValidationError,
  MAX_SOURCE_FILE_BYTES,
} from '../imageUpload';

// ─── sniffImageType ──────────────────────────────────────────────────────
// The vitest environment for this project is 'node', not 'jsdom' — there is
// no canvas/Image implementation available, so the canvas-decode success
// path of processPhotoUpload can't be exercised here (same as this
// codebase's two existing processImage precedents, which are also
// untested/browser-verified-only). What's tested below is everything that
// doesn't depend on the DOM: magic-byte detection itself, and every
// rejection path of processPhotoUpload that throws before ever touching
// Image/canvas.

describe('sniffImageType', () => {
  it('identifies a JPEG signature', () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe('image/jpeg');
  });

  it('identifies a PNG signature', () => {
    expect(
      sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])),
    ).toBe('image/png');
  });

  it('identifies a WEBP signature (RIFF ... WEBP)', () => {
    const bytes = new Uint8Array(16);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
    bytes.set([0x00, 0x00, 0x00, 0x00], 4); // chunk size, irrelevant here
    bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
    expect(sniffImageType(bytes)).toBe('image/webp');
  });

  it('rejects a RIFF file that is not WEBP (e.g. a WAV file)', () => {
    const bytes = new Uint8Array(16);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
    bytes.set([0x00, 0x00, 0x00, 0x00], 4);
    bytes.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE", not "WEBP"
    expect(sniffImageType(bytes)).toBeNull();
  });

  it('returns null for unrecognized bytes', () => {
    expect(sniffImageType(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });

  it('returns null for a renamed non-image file with a spoofed extension', () => {
    const bytes = new TextEncoder().encode('MZ\x90\x00this is actually an executable');
    expect(sniffImageType(bytes)).toBeNull();
  });
});

// ─── processPhotoUpload — validation/rejection paths ────────────────────

describe('processPhotoUpload validation', () => {
  it('rejects a file larger than MAX_SOURCE_FILE_BYTES before sniffing or decoding', async () => {
    const oversized = new File([new Uint8Array(MAX_SOURCE_FILE_BYTES + 1)], 'big.jpg', {
      type: 'image/jpeg',
    });
    await expect(processPhotoUpload(oversized)).rejects.toBeInstanceOf(PhotoValidationError);
  });

  it('rejects a file whose bytes do not match any whitelisted signature', async () => {
    const bogus = new File([new Uint8Array([0x00, 0x01, 0x02, 0x03])], 'fake.jpg', {
      type: 'image/jpeg',
    });
    await expect(processPhotoUpload(bogus)).rejects.toBeInstanceOf(PhotoValidationError);
  });

  it('rejects a mislabeled non-image file (magic bytes do not match its claimed type)', async () => {
    const spoofed = new File([new TextEncoder().encode('plain text content')], 'note.png', {
      type: 'image/png',
    });
    await expect(processPhotoUpload(spoofed)).rejects.toBeInstanceOf(PhotoValidationError);
  });
});
