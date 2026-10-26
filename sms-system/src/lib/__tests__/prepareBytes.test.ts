import { describe, expect, it } from 'vitest';
import { IMAGE_CAP_BYTES, PICTURE_UNREADABLE, TOO_LARGE_EVEN_REDUCED, prepareBytes, type Encoder } from '../examImage';
import { buildJpeg, buildPng, TEXT_CHUNK } from './imageFixtures';

// The picture check without a DOM (examImage.ts prepareBytes): what the import and the builder's control both run.

/** A picture whose pixels do not compress (a fixed pseudo-random sequence), so it cannot fit the cap as it is. */
function noisy(width: number, height: number): Uint8Array {
  const row = 1 + width * 3;
  const raw = new Uint8Array(row * height);
  let x = 12345;
  for (let i = 0; i < raw.length; i += 1) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    raw[i] = i % row === 0 ? 0 : x >>> 24;
  }
  return buildPng({ width, height, raw });
}

const none = () => {
  throw new Error('the canvas should not be needed');
};

describe('prepareBytes', () => {
  it('keeps a picture that fits, takes its private chunk out and never asks for the canvas', async () => {
    const out = await prepareBytes(buildPng({ width: 64, height: 48, extra: [TEXT_CHUNK] }), none);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.picture).toMatchObject({ mime: 'image/png', w: 64, h: 48, exact: true });
    expect(out.picture.report).toMatch(/kept exactly/);
    expect(out.picture.data.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('keeps a JPEG as a JPEG', async () => {
    const out = await prepareBytes(buildJpeg(), none);
    expect(out.ok && out.picture.mime).toBe('image/jpeg');
  });

  it('refuses what is not a usable picture, in words, without throwing', async () => {
    const gif = await prepareBytes(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]), none);
    expect(gif).toEqual({ ok: false, message: expect.stringContaining('GIF pictures are not accepted') });
    const text = await prepareBytes(new TextEncoder().encode('hello'), none);
    expect(text.ok).toBe(false);
    const cut = await prepareBytes(buildPng({ noEnd: true }), none);
    expect(cut.ok).toBe(false);
  });

  it('asks for the canvas only when the picture does not fit, once, and reduces it', async () => {
    let made = 0;
    const encoder: Encoder = {
      png: async () => new Uint8Array(IMAGE_CAP_BYTES + 1),
      lossy: async (_mime, quality) => (quality <= 0.9 ? new Uint8Array(100_000) : new Uint8Array(IMAGE_CAP_BYTES + 1)),
    };
    const big = noisy(400, 400);
    expect(big.length).toBeGreaterThan(IMAGE_CAP_BYTES);
    const out = await prepareBytes(big, () => {
      made += 1;
      return encoder;
    });
    expect(made).toBe(1);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.picture.exact).toBe(false);
      expect(out.picture.report).toMatch(/reduced/);
    }
  });

  it('says a picture is too large when nothing fits, and turns a failing canvas into a message', async () => {
    const big = noisy(400, 400);
    const huge: Encoder = { png: async () => new Uint8Array(IMAGE_CAP_BYTES + 1), lossy: async () => new Uint8Array(IMAGE_CAP_BYTES + 1) };
    expect(await prepareBytes(big, () => huge)).toEqual({ ok: false, message: TOO_LARGE_EVEN_REDUCED });
    expect(
      await prepareBytes(big, () => {
        throw new Error('no canvas');
      }),
    ).toEqual({ ok: false, message: PICTURE_UNREADABLE });
  });
});
