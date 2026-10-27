import type { ExamQuestion } from '@/types/exams';

// How a student's browser fetches the pictures of an exam (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md
// §6.2): the packs one at a time in the background, the one the student is looking at first, each tried a few times, and
// a picture that did not come never stops the student answering. Pure and Firebase-free.

/** The pictures of one pack as a screen holds them: the data URL of each, by its id inside the pack. */
export type PackImages = Record<string, { mime: string; data: string }>;

export type PictureState = 'ready' | 'loading' | 'failed';

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * Is this the data URL of a picture the builder could have saved (a PNG, JPEG or WebP in base64)? The packs are written by
 * staff only, but a student's browser puts the string in an image's `src`, so anything else is not shown.
 */
export const isImageDataUrl = (value: unknown): value is string => typeof value === 'string' && IMAGE_DATA_URL.test(value);

/**
 * The packs the questions use, in the order to read them: the pack of the question on screen first, then the packs of the
 * questions after it, then those before it (a student mostly moves forward). Each pack once; empty without pictures.
 */
export function packOrder(questions: readonly Pick<ExamQuestion, 'image'>[], current: number): number[] {
  const start = Math.min(Math.max(current, 0), Math.max(questions.length - 1, 0));
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = 0; i < questions.length; i += 1) {
    const image = questions[(start + i) % questions.length].image;
    if (image && !seen.has(image.pack)) {
      seen.add(image.pack);
      out.push(image.pack);
    }
  }
  return out;
}

/** Ready when the picture is in its loaded pack; failed when its pack failed or the pack lacks it; loading otherwise. */
export function pictureState(
  image: { pack: number; id: string },
  loaded: Readonly<Record<number, PackImages>>,
  failed: readonly number[],
): PictureState {
  const pack = loaded[image.pack];
  if (pack) return pack[image.id] ? 'ready' : 'failed';
  return failed.includes(image.pack) ? 'failed' : 'loading';
}

/** Runs `run` up to `tries` times with a pause between; throws the last error. */
export async function withRetries<T>(
  run: () => Promise<T>,
  tries: number,
  pauseMs: number,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= tries) throw err;
      await sleep(pauseMs);
    }
  }
}
