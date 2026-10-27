import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { addPictures, newQuestion, splitDraft, type BuilderQuestion } from '../examBuilderLogic';
import { questionsFromDocx } from '../examDocx';
import { mergeImported } from '../examImport';
import { prepareBytes } from '../examImageEncoding';
import { planImageSave } from '../examImagePack';
import {
  applyPrepared,
  canContinue,
  chosen,
  keepAllClear,
  keepItem,
  pending,
  picturesForMerged,
  preparePictures,
  startReview,
  type ReviewItem,
} from '../examImportReview';
import { TEXT_CHUNK, buildPng, chunkTypes } from './imageFixtures';

// A Word file all the way to the packs: read, placed, reviewed, merged into the builder's list and planned for saving,
// with the real pure code at every step and no canvas (a picture that fits needs none).

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

const TITLE_PNG = buildPng({ width: 80, height: 30 });
const TOOL_PNG = buildPng({ width: 64, height: 48, extra: [TEXT_CHUNK] }); // carries where it was taken
const OPTION_PNG = buildPng({ width: 50, height: 50 });
const EMF = strToU8('not really an emf');

const p = (s: string) => `<w:p><w:r><w:t xml:space="preserve">${s}</w:t></w:r></w:p>`;
const picture = (rid: string, descr: string) =>
  `<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="P" descr="${descr}"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

const body =
  p('Unit test') + picture('rId1', 'Title picture') +
  p('1. Which tool is this?') + picture('rId2', 'A vice') + p('A. A vice') + p('B. A clamp') + p('Answer: A') +
  p('2. Which is stronger?') + p('A. one') + p('B. two') + picture('rId3', 'Option picture') + p('Answer: B') +
  p('3. Name the figure') + picture('rId4', 'A figure') + p('A. x') + p('B. y') + p('Answer: A') +
  p('4. Is this the same tool again?') + picture('rId2', 'Again') + p('A. yes') + p('B. no') + p('Answer: A');

const rels = ['rId1:title.png', 'rId2:tool.png', 'rId3:option.png', 'rId4:figure.emf']
  .map((x) => x.split(':'))
  .map(([id, file]) => `<Relationship Id="${id}" Type="${IMAGE}" Target="media/${file}"/>`)
  .join('');

const file = zipSync({
  'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${NS}><w:body>${body}</w:body></w:document>`),
  'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`),
  'word/media/title.png': TITLE_PNG,
  'word/media/tool.png': TOOL_PNG,
  'word/media/option.png': OPTION_PNG,
  'word/media/figure.emf': EMF,
});

/** The picture check with no canvas: a picture that fits is never re-encoded, so asking for the canvas is a failure. */
const prepare = (bytes: Uint8Array) =>
  prepareBytes(bytes, () => {
    throw new Error('the canvas should not be needed');
  });

async function reviewed(): Promise<{ result: ReturnType<typeof questionsFromDocx>; items: ReviewItem[] }> {
  const result = questionsFromDocx(file, 'single');
  let items = startReview(result.images ?? [], result.pictures ?? []);
  await preparePictures(items, result.pictures ?? [], prepare, (index, outcome) => {
    items = applyPrepared(items, index, outcome);
  });
  return { result, items };
}

const existing = (n: number): BuilderQuestion[] => Array.from({ length: n }, (_, i) => ({ ...newQuestion('single', () => (i + 1) / 10 / 1.01), id: `old${i + 1}` }));

describe('a Word file with pictures, from the file to the packs', () => {
  it('places the pictures the way the reader is sure of, and the picture check refuses the one a browser cannot show', async () => {
    const { result, items } = await reviewed();
    expect(result.questions).toHaveLength(4);
    expect(result.images).toEqual([
      { index: 0, questionIndex: null, confidence: 'unassigned' },
      { index: 1, questionIndex: 0, confidence: 'clear' },
      { index: 2, questionIndex: 1, confidence: 'check' },
      { index: 3, questionIndex: 2, confidence: 'clear' },
      { index: 4, questionIndex: 3, confidence: 'clear' },
    ]);
    expect(items[3].refusal).toContain('EMF or WMF');
    expect(items[1].prepared!.report).toMatch(/kept exactly/);
    expect(items[1].prepared!.alt).toBe('A vice');
  });

  it('holds Continue for the check picture, then hands on the three pictures that were chosen', async () => {
    const { items } = await reviewed();
    const clear = keepAllClear(items);
    expect(pending(clear)).toEqual([2]);
    expect(canContinue(clear)).toBe(false);
    const decided = keepItem(clear, 2);
    expect(canContinue(decided)).toBe(true);
    expect(chosen(decided).map((c) => c.questionIndex)).toEqual([0, 1, 3]);
  });

  it('puts the pictures on the right questions of the exam’s list and plans one pack with the cleaned picture stored once', async () => {
    const { result, items } = await reviewed();
    const decided = keepItem(keepAllClear(items), 2);
    const merged = mergeImported(existing(1), result.questions, 'append');
    const placed = picturesForMerged(result.questions, merged.questions, chosen(decided));
    const { packs, draft } = addPictures({}, merged.questions, placed);

    expect(draft).toHaveLength(5);
    expect(draft.map((q) => q.image !== undefined)).toEqual([false, true, true, false, true]);
    expect(draft[1].image).toMatchObject({ pack: 1, alt: 'A vice', exact: true });
    expect(draft[2].image).toMatchObject({ pack: 1, alt: 'Option picture' });
    expect(draft[4].image).toMatchObject({ pack: 1, alt: 'Again' });
    expect(draft[4].image!.id, 'the same file on two questions is stored once').toBe(draft[1].image!.id);

    const plan = planImageSave({ before: {}, after: packs, questions: splitDraft(draft).questions, hadFields: false });
    expect(plan.stats.count).toBe(1);
    expect(Object.keys(plan.packs[1].images)).toHaveLength(2);
    expect(plan.examFields).toMatchObject({ imagePacks: 1 });
    expect(plan.examFields!.imageBytes).toBeGreaterThan(0);

    const stored = plan.packs[1].images[draft[1].image!.id];
    expect(stored.mime).toBe('image/png');
    const kept = Uint8Array.from(atob(stored.data.slice(stored.data.indexOf(',') + 1)), (c) => c.charCodeAt(0));
    expect(chunkTypes(TOOL_PNG)).toContain('tEXt');
    expect(chunkTypes(kept), 'the text chunk that says where it was taken is gone').not.toContain('tEXt');
  });

  it('drops the picture of a question that did not fit under the limit of 100 questions', async () => {
    const { result, items } = await reviewed();
    const decided = keepItem(keepAllClear(items), 2);
    const merged = mergeImported(existing(98), result.questions, 'append');
    expect(merged.questions).toHaveLength(100);
    expect(merged.dropped).toBe(2);
    const placed = picturesForMerged(result.questions, merged.questions, chosen(decided));
    expect(placed.map((x) => x.questionId)).toEqual([result.questions[0].id, result.questions[1].id]);
    const { packs, draft } = addPictures({}, merged.questions, placed);
    expect(draft.filter((q) => q.image).length).toBe(2);
    expect(Object.keys(packs[1].images)).toHaveLength(2);
  });

  it('replaces the exam’s questions with the imported ones and keeps the pictures on them', async () => {
    const { result, items } = await reviewed();
    const decided = keepItem(keepAllClear(items), 2);
    const merged = mergeImported(existing(5), result.questions, 'replace');
    const placed = picturesForMerged(result.questions, merged.questions, chosen(decided));
    expect(placed).toHaveLength(3);
    expect(merged.questions.map((q) => q.id)).toEqual(result.questions.map((q) => q.id));
  });
});
