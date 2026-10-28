import { describe, expect, it } from 'vitest';
import {
  addPicture,
  addPictures,
  newQuestion,
  type BuilderQuestion,
  type PreparedImage,
} from '../examBuilderLogic';
import type { ImportImage, ImportPicture } from '../examImportPictures';
import {
  applyPrepared,
  canContinue,
  chosen,
  conflicts,
  keepAllClear,
  keepItem,
  moveItem,
  pending,
  preparePictures,
  questionLabel,
  removeItem,
  startReview,
  statusOf,
  summary,
  type PrepareOutcome,
} from '../examImportReview';

// What the teacher decides about the pictures of a Word import (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.4).

const bytes = new Uint8Array([1, 2, 3]);
const picture = (over: Partial<ImportPicture> = {}): ImportPicture => ({ bytes, format: 'png', alt: 'A vice', cropped: false, ...over });
const prepared = (data = 'AAAA', over: Partial<PreparedImage> = {}): PreparedImage => ({
  mime: 'image/png',
  data: `data:image/png;base64,${data}`,
  bytes: 10,
  w: 40,
  h: 30,
  exact: true,
  report: '1 KB, kept exactly',
  ...over,
});
const ok = (data?: string): PrepareOutcome => ({ ok: true, picture: prepared(data) });

const images: ImportImage[] = [
  { index: 0, questionIndex: 0, confidence: 'clear' },
  { index: 1, questionIndex: 1, confidence: 'check' },
  { index: 2, questionIndex: null, confidence: 'unassigned' },
];
const pictures = [picture(), picture(), picture()];

/** All three pictures started and checked. */
const ready = () => images.reduce((list, image) => applyPrepared(list, image.index, ok(`P${image.index}`)), startReview(images, pictures));

describe('starting the review', () => {
  it('makes one item per picture in picture order, with the place and confidence the parser gave', () => {
    const items = startReview([...images].reverse(), pictures);
    expect(items.map((i) => [i.index, i.questionIndex, i.confidence, i.decision])).toEqual([
      [0, 0, 'clear', 'undecided'],
      [1, 1, 'check', 'undecided'],
      [2, null, 'unassigned', 'undecided'],
    ]);
    expect(items[0].alt).toBe('A vice');
  });

  it('starts a picture the file could not give as removed, with the reason', () => {
    const items = startReview(images, [picture({ problem: 'unsupported', bytes: null }), picture({ problem: 'too_large', bytes: null }), picture({ problem: 'missing', bytes: null })]);
    expect(items.map((i) => i.decision)).toEqual(['removed', 'removed', 'removed']);
    expect(items[0].refusal).toContain('EMF or WMF');
    expect(items[1].refusal).toContain('too large');
    expect(items[2].refusal).toContain('could not be found');
    expect(startReview([images[0]], [])[0].refusal).toContain('could not be found');
  });
});

describe('the picture check', () => {
  it('keeps the prepared picture with Word’s alt text, or refuses the picture with the message and removes it', () => {
    const items = applyPrepared(applyPrepared(startReview(images, pictures), 0, ok()), 1, { ok: false, message: 'GIF pictures are not accepted.' });
    expect(items[0].prepared).toMatchObject({ report: '1 KB, kept exactly', alt: 'A vice' });
    expect(items[1]).toMatchObject({ prepared: null, refusal: 'GIF pictures are not accepted.', decision: 'removed' });
  });

  it('runs one picture at a time in order, tells the caller each result, and turns a thrown error into a refusal', async () => {
    const seen: [number, boolean][] = [];
    const calls: number[] = [];
    const list = startReview(images, [picture(), picture(), picture()]);
    await preparePictures(
      list,
      [picture(), picture(), picture()],
      async () => {
        calls.push(calls.length);
        if (calls.length === 2) throw new Error('boom');
        return ok();
      },
      (index, outcome) => seen.push([index, outcome.ok]),
    );
    expect(seen).toEqual([[0, true], [1, false], [2, true]]);
  });

  it('skips pictures that are refused or already checked, and stops when asked', async () => {
    const list = applyPrepared(startReview(images, [picture(), picture({ problem: 'unsupported', bytes: null }), picture()]), 0, ok());
    const seen: number[] = [];
    await preparePictures(list, [picture(), picture({ problem: 'unsupported', bytes: null }), picture()], async () => ok(), (i) => seen.push(i));
    expect(seen).toEqual([2]);
    const stopped: number[] = [];
    await preparePictures(startReview(images, pictures), pictures, async () => ok(), (i) => stopped.push(i), () => true);
    expect(stopped).toEqual([]);
  });
});

describe('deciding', () => {
  it('Use keeps a picture on the question it was matched to, and not one on no question or not yet checked', () => {
    expect(keepItem(ready(), 0)[0].decision).toBe('use');
    expect(keepItem(ready(), 2)[2].decision).toBe('undecided');
    expect(keepItem(startReview(images, pictures), 0)[0].decision).toBe('undecided');
  });

  it('Move puts it on another question and uses it there, including a picture that was on none', () => {
    const items = moveItem(ready(), 2, 1);
    expect(items[2]).toMatchObject({ questionIndex: 1, decision: 'use' });
  });

  it('Remove removes it, and a refused picture cannot be changed', () => {
    expect(removeItem(ready(), 0)[0].decision).toBe('removed');
    const refused = applyPrepared(startReview(images, pictures), 0, { ok: false, message: 'no' });
    expect(keepItem(refused, 0)[0].decision).toBe('removed');
    expect(moveItem(refused, 0, 1)[0].questionIndex).toBe(0);
  });

  it('Use all clear ones uses the clear ones that are ready, never a check one or a refused one', () => {
    const items = keepAllClear(ready());
    expect(items.map((i) => i.decision)).toEqual(['use', 'undecided', 'undecided']);
    const refused = keepAllClear(applyPrepared(startReview(images, pictures), 0, { ok: false, message: 'no' }));
    expect(refused[0].decision).toBe('removed');
  });
});

describe('what blocks Continue', () => {
  it('waits for every clear and check picture, but not for one on no question or one that cannot be used', () => {
    let items = ready();
    expect(pending(items)).toEqual([0, 1]);
    expect(canContinue(items)).toBe(false);
    items = keepAllClear(items);
    expect(pending(items)).toEqual([1]);
    items = removeItem(items, 1);
    expect(pending(items)).toEqual([]);
    expect(canContinue(items)).toBe(true);
    expect(statusOf(items[2])).toBe('dropped');
  });

  it('waits while a picture is still being checked', () => {
    expect(canContinue(startReview(images, pictures))).toBe(false);
  });

  it('is blocked when two pictures are used on one question, naming them, until one is removed or moved', () => {
    let items = keepAllClear(ready());
    items = moveItem(items, 1, 0);
    expect(conflicts(items)).toEqual({ 0: [0, 1] });
    expect(canContinue(items)).toBe(false);
    expect(canContinue(removeItem(items, 1))).toBe(true);
    expect(canContinue(moveItem(items, 1, 1))).toBe(true);
  });
});

describe('what the review hands on', () => {
  it('chooses the used pictures with their question, and nothing else', () => {
    const items = removeItem(keepAllClear(ready()), 1);
    expect(chosen(items)).toEqual([{ questionIndex: 0, picture: expect.objectContaining({ data: 'data:image/png;base64,P0', alt: 'A vice' }) }]);
    expect(chosen(startReview(images, pictures))).toEqual([]);
  });

  it('says in one line how many are used, removed and left out', () => {
    expect(summary(ready())).toBe('1 will not be imported.');
    const items = removeItem(keepAllClear(ready()), 1);
    expect(summary(items)).toBe('1 will be used, 1 removed, 1 will not be imported.');
    expect(summary([])).toBe('No picture is used yet.');
  });

  it('labels a question with its number and the start of its text', () => {
    expect(questionLabel({ text: 'Identify the tool shown' }, 6)).toBe('Question 7: Identify the tool shown');
    const long = questionLabel({ text: 'x'.repeat(100) }, 0);
    expect(long.length).toBeLessThanOrEqual('Question 1: '.length + 60);
    expect(long.endsWith('…')).toBe(true);
    expect(questionLabel({ text: '  two \n lines ' }, 1)).toBe('Question 2: two lines');
  });
});

describe('putting the chosen pictures on the imported questions', () => {
  const list = (n: number): BuilderQuestion[] => Array.from({ length: n }, (_, i) => ({ ...newQuestion('single', () => (i + 1) / 10 / 1.01), id: `q${i + 1}` }));

  it('starts a question’s alt text from the Word description, and keeps a typed one on a replaced picture', () => {
    const one = addPicture({}, list(1), 'q1', prepared('A', { alt: 'From Word' }));
    expect(one.draft[0].image!.alt).toBe('From Word');
    const typed = { ...one.draft[0], image: { ...one.draft[0].image!, alt: 'Typed' } };
    const two = addPicture(one.packs, [typed], 'q1', prepared('B', { alt: 'Other' }));
    expect(two.draft[0].image!.alt).toBe('Typed');
  });

  it('adds several pictures in order, storing the same picture once', () => {
    const out = addPictures({}, list(3), [
      { questionId: 'q1', picture: prepared('A') },
      { questionId: 'q3', picture: prepared('A') },
      { questionId: 'q2', picture: prepared('B') },
    ]);
    expect(out.draft.map((q) => q.image?.pack)).toEqual([1, 1, 1]);
    expect(Object.keys(out.packs[1].images)).toHaveLength(2);
    expect(out.draft[0].image!.id).toBe(out.draft[2].image!.id);
  });
});
