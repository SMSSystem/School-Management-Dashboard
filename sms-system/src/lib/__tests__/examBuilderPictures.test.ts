import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import QuestionEditor from '../../components/exam/builder/QuestionEditor';
import BuilderToolbar from '../../components/exam/builder/BuilderToolbar';
import controlRaw from '../../components/exam/builder/QuestionImageControl.tsx?raw';
import pageRaw from '../../scenes/(dashboard)/list/exams/build/index.tsx?raw';
import hookRaw from '../../hooks/useExamBuilder.ts?raw';
import {
  addPicture,
  draftChanged,
  duplicateQuestion,
  newQuestion,
  picturesNote,
  removePicture,
  setPictureAlt,
  splitDraft,
  type BuilderQuestion,
  type EditMode,
  type PreparedImage,
} from '../examBuilderLogic';
import { referencesOf, withoutOrphans } from '../examImagePack';
import { estimateExamWrites } from '../examBudget';
import { chooseEncodingFor, IMAGE_CAP_BYTES, TOO_LARGE_EVEN_REDUCED, type Encoder, type ImageInfo } from '../examImage';

// The picture control of the builder (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §6.1): the pure list
// logic, the order of the encodings behind a fake canvas, and what the screens render and pin.

const norm = (s: string) => s.split('\r\n').join('\n');
const control = norm(controlRaw);
const page = norm(pageRaw);
const hook = norm(hookRaw);
const noop = () => undefined;

const picture = (data: string, over: Partial<PreparedImage> = {}): PreparedImage => ({
  mime: 'image/png',
  data: `data:image/png;base64,${data}`,
  bytes: 100,
  w: 40,
  h: 30,
  exact: true,
  report: '1 KB, kept exactly',
  ...over,
});

const list = (n: number): BuilderQuestion[] =>
  Array.from({ length: n }, (_, i) => ({ ...newQuestion('single', () => (i + 1) / 10 / 1.01), id: `q${i + 1}` }));

describe('adding a picture to a question', () => {
  it('puts it in the first pack and gives the question a reference with the size, the bytes and whether it is exact', () => {
    const out = addPicture({}, list(2), 'q1', picture('AAAA'));
    const image = out.draft[0].image!;
    expect(image).toMatchObject({ pack: 1, w: 40, h: 30, bytes: 100, exact: true, alt: '' });
    expect(out.packs[1].images[image.id].data).toBe('data:image/png;base64,AAAA');
    expect(out.draft[1].image).toBeUndefined();
  });

  it('stores the same picture on two questions once, with two references', () => {
    const one = addPicture({}, list(2), 'q1', picture('AAAA'));
    const two = addPicture(one.packs, one.draft, 'q2', picture('AAAA'));
    expect(two.draft[1].image).toMatchObject({ id: two.draft[0].image!.id, pack: 1 });
    expect(Object.keys(two.packs[1].images)).toHaveLength(1);
  });

  it('replacing a picture frees the old one room and keeps the alt text', () => {
    const one = addPicture({}, list(1), 'q1', picture('AAAA'));
    const withAlt = { ...one.draft[0], image: { ...one.draft[0].image!, alt: 'A vice' } };
    const two = addPicture(one.packs, [withAlt], 'q1', picture('BBBB'));
    expect(two.draft[0].image!.alt).toBe('A vice');
    expect(Object.values(two.packs[1].images).map((i) => i.data)).toEqual(['data:image/png;base64,BBBB']);
  });

  it('keeps a picture another question still uses when this question picture is replaced', () => {
    const one = addPicture({}, list(2), 'q1', picture('AAAA'));
    const two = addPicture(one.packs, one.draft, 'q2', picture('AAAA'));
    const three = addPicture(two.packs, two.draft, 'q1', picture('BBBB'));
    expect(
      Object.values(three.packs[1].images)
        .map((i) => i.data)
        .sort(),
    ).toEqual(['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB']);
  });

  it('starts a new pack when the first has no room', () => {
    const one = addPicture({}, list(2), 'q1', picture('A'.repeat(500_000)));
    const two = addPicture(one.packs, one.draft, 'q2', picture('B'.repeat(500_000)));
    expect(two.draft[1].image!.pack).toBe(2);
  });

  it('does nothing for a question that is not in the list', () => {
    const out = addPicture({}, list(1), 'nope', picture('AAAA'));
    expect(out.packs).toEqual({});
  });
});

describe('the rest of the picture life in the list', () => {
  const base = addPicture({}, list(2), 'q1', picture('AAAA'));

  it('removing it drops the reference, and the packs stripped of what nothing refers to are empty', () => {
    const removed = removePicture(base.draft[0]);
    expect('image' in removed).toBe(false);
    expect(withoutOrphans(base.packs, referencesOf([removed]))).toEqual({});
  });

  it('ticking decorative empties the alt text and unticking starts again from what is typed', () => {
    const typed = setPictureAlt(base.draft[0], 'A vice', false);
    expect(typed.image!.alt).toBe('A vice');
    const decorative = setPictureAlt(typed, 'ignored', true);
    expect(decorative.image).toMatchObject({ alt: '', decorative: true });
    const back = setPictureAlt(decorative, 'Again', false);
    expect(back.image!.alt).toBe('Again');
    expect('decorative' in back.image!).toBe(false);
  });

  it('Duplicate question shares the reference, and any picture change is an unsaved change', () => {
    const copy = duplicateQuestion(base.draft, 0);
    expect(copy[1].image).toEqual(copy[0].image);
    expect(draftChanged(list(2), base.draft)).toBe(true);
    expect(draftChanged(base.draft, [setPictureAlt(base.draft[0], 'x', false), base.draft[1]])).toBe(true);
    expect(draftChanged(base.draft, [removePicture(base.draft[0]), base.draft[1]])).toBe(true);
  });

  it('the picture goes with the question into the questions document, not into the key', () => {
    const { questions, answers } = splitDraft(base.draft);
    expect(questions[0].image).toBeDefined();
    expect(JSON.stringify(answers)).not.toContain('base64');
  });

  it('the note counts the pictures in use and what a student downloads, and is empty without any', () => {
    expect(picturesNote({}, list(1))).toBeNull();
    expect(picturesNote(base.packs, base.draft)).toBe('1 picture: about 0 MB downloaded per student.');
    expect(picturesNote(base.packs, [removePicture(base.draft[0])])).toBeNull();
    const two = addPicture(base.packs, base.draft, 'q2', picture('B'));
    expect(picturesNote(two.packs, two.draft)).toMatch(/^2 pictures: /);
  });
});

// A fake canvas: what each encoder answers, and what it was asked.
function fakeEncoder(sizes: { png?: number | null; webp?: (q: number) => number | null; jpeg?: (q: number) => number | null }) {
  const asked: string[] = [];
  const encoder: Encoder = {
    async png() {
      asked.push('png');
      return sizes.png == null ? null : new Uint8Array(sizes.png);
    },
    async lossy(mime, quality, size) {
      asked.push(`${mime}@${quality}:${size.width}x${size.height}`);
      const n = (mime === 'image/webp' ? sizes.webp : sizes.jpeg)?.(quality);
      return n == null ? null : new Uint8Array(n);
    },
  };
  return { encoder, asked };
}

const info = (over: Partial<ImageInfo> = {}): ImageInfo => ({
  mime: 'image/png',
  width: 800,
  height: 600,
  hasAlpha: false,
  bitDepth: 8,
  orientation: 1,
  hasIccProfile: false,
  canReencodeExactly: true,
  ...over,
});
const OVER = IMAGE_CAP_BYTES + 1000;
const FITS = 100_000;

describe('the order of the encodings', () => {
  it('keeps the cleaned original when it fits, and never asks the canvas', async () => {
    const { encoder, asked } = fakeEncoder({});
    const chosen = await chooseEncodingFor(info(), new Uint8Array(FITS), encoder);
    expect(chosen!.candidate).toMatchObject({ step: 'cleaned', exact: true, bytes: FITS });
    expect(asked).toEqual([]);
  });

  it('tries a PNG of the pixels next, only for a source the canvas reproduces exactly', async () => {
    const exact = fakeEncoder({ png: FITS });
    expect((await chooseEncodingFor(info(), new Uint8Array(OVER), exact.encoder))!.candidate).toMatchObject({ step: 'png', mime: 'image/png', exact: true });
    const inexact = fakeEncoder({ png: FITS, webp: () => FITS });
    const chosen = await chooseEncodingFor(info({ canReencodeExactly: false, hasAlpha: true }), new Uint8Array(OVER), inexact.encoder);
    expect(chosen!.candidate).toMatchObject({ step: 'reduced', exact: false });
    expect(inexact.asked).not.toContain('png');
  });

  it('then steps the quality down and stops at the first that fits', async () => {
    const { encoder, asked } = fakeEncoder({ png: OVER, webp: (q) => (q >= 0.9 ? OVER : FITS) });
    const chosen = await chooseEncodingFor(info(), new Uint8Array(OVER), encoder);
    expect(chosen!.candidate).toMatchObject({ step: 'reduced', mime: 'image/webp', quality: 0.85, resized: false, exact: false });
    expect(asked).toEqual(['png', 'image/webp@0.95:800x600', 'image/webp@0.92:800x600', 'image/webp@0.9:800x600', 'image/webp@0.85:800x600']);
  });

  it('falls back to JPEG when the browser cannot write WebP, and resizes beyond 1600 px', async () => {
    const { encoder, asked } = fakeEncoder({ png: null, webp: () => null, jpeg: () => FITS });
    const chosen = await chooseEncodingFor(info({ width: 4000, height: 2000, canReencodeExactly: false }), new Uint8Array(OVER), encoder);
    expect(chosen!.candidate).toMatchObject({ mime: 'image/jpeg', resized: true, width: 1600, height: 800 });
    expect(asked).toEqual(['image/webp@0.95:1600x800', 'image/jpeg@0.95:1600x800']);
  });

  it('shows a turned phone photo at its turned size, and gives up when nothing fits', async () => {
    const { encoder } = fakeEncoder({ png: OVER, webp: () => OVER });
    expect(await chooseEncodingFor(info({ orientation: 6 }), new Uint8Array(OVER), encoder)).toBeNull();
    const turned = await chooseEncodingFor(info({ orientation: 6 }), new Uint8Array(FITS), encoder);
    expect(turned!.candidate).toMatchObject({ width: 600, height: 800 });
    expect(TOO_LARGE_EVEN_REDUCED).toContain('too large');
  });

  it('falls through to the canvas when the original could not be cleaned', async () => {
    const { encoder } = fakeEncoder({ png: FITS });
    expect((await chooseEncodingFor(info(), null, encoder))!.candidate.step).toBe('png');
  });
});

describe('the screens', () => {
  const editor = (over: Partial<Parameters<typeof QuestionEditor>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(QuestionEditor, {
        question: list(1)[0],
        index: 0,
        total: 1,
        answerMode: 'single',
        mode: 'full' as EditMode,
        issues: [],
        imageSrc: undefined,
        onChange: noop,
        onPicture: noop,
        onRemovePicture: noop,
        onPictureAlt: noop,
        onMove: noop,
        onDuplicate: noop,
        onDelete: noop,
        ...over,
      }),
    );
  const withPicture = (): BuilderQuestion => addPicture({}, list(1), 'q1', picture('AAAA')).draft[0];

  it('offers Add picture to a question without one, and nothing when the exam cannot be edited', () => {
    const html = editor();
    expect(html).toContain('Add picture');
    expect(html).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(editor({ mode: 'key_only' })).not.toContain('Add picture');
    expect(editor({ mode: 'read_only' })).not.toContain('Add picture');
  });

  it('shows the preview, Replace, Remove, the alt text and the decorative tick for a question with a picture', () => {
    const html = editor({ question: withPicture(), imageSrc: 'data:image/png;base64,AAAA' });
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('Replace picture');
    expect(html).toContain('Remove picture');
    expect(html).toContain('Alt text');
    expect(html).toContain('Decorative');
    expect(html).toContain('40 × 30 px');
  });

  it('says so when the pack does not hold the picture, and notes a reduced picture', () => {
    const q = withPicture();
    const reduced = { ...q, image: { ...q.image!, exact: false } };
    const html = editor({ question: reduced, imageSrc: undefined });
    expect(html).toContain('The picture could not be found. Replace or remove it.');
    expect(html).toContain('made smaller to fit');
  });

  it('shows the picture without the buttons in key-only mode', () => {
    const html = editor({ question: withPicture(), imageSrc: 'data:image/png;base64,AAAA', mode: 'key_only' });
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).not.toContain('Replace picture');
  });

  it('shows the progress on the Save button while the pictures are saved', () => {
    const bar = (progress: { done: number; total: number } | null) =>
      renderToStaticMarkup(
        createElement(BuilderToolbar, {
          title: 'T',
          subtitle: '',
          statusLabel: 'Draft',
          questionCount: 1,
          totalPoints: 1,
          mode: 'full' as EditMode,
          dirty: true,
          busy: true,
          progress,
          notice: null,
          actions: [],
          onSave: noop,
          onStatus: noop,
          getBlockers: () => [],
        }),
      );
    expect(bar({ done: 3, total: 9 })).toContain('Saving images 3 of 9…');
    expect(bar(null)).toContain('Saving…');
  });
});

describe('pins', () => {
  it('the control takes a file by button, drop and paste, prepares it in the lazy chunk and keeps the image undraggable', () => {
    expect(control).toContain('accept={ACCEPT}');
    expect(control).toContain('onDrop=');
    expect(control).toContain('onPaste=');
    expect(control).toContain('await import("@/lib/examImageCanvas")');
    expect(control).toContain('draggable={false}');
  });

  it('the hook reads the packs only when the exam has pictures, and the save passes them only in full mode', () => {
    expect(hook).toContain('(loaded.imagePacks ?? 0) > 0 ? loadExamPacks(institutionId, examId)');
    expect(hook).toContain('packs: mode === "full" ? { before: savedPacks, after: packs } : undefined');
    expect(hook).toContain('onProgress: (done, total) => setProgress({ done, total })');
  });

  it('the page wires the pictures to each question and shows the note', () => {
    expect(page).toContain('b.setPicture(question.id, picture)');
    expect(page).toContain('b.packs[question.image.pack]?.images[question.image.id]?.data');
    expect(page).toContain('picturesNote(b.packs, draft)');
  });

  it('the estimate carries the megabytes a student downloads for the pictures', () => {
    const none = estimateExamWrites({ students: 30, durationMinutes: 60, checkpointMinutes: 10, releaseMode: 'manual' });
    expect(none.downloadMbPerStudent).toBe(0);
    const some = estimateExamWrites({ students: 30, durationMinutes: 60, checkpointMinutes: 10, releaseMode: 'manual', imagePacks: 2, imageBytes: 3 * 1024 * 1024 });
    expect(some.downloadMbPerStudent).toBe(3);
    expect(some.downloadMb).toBe(90);
  });
});
