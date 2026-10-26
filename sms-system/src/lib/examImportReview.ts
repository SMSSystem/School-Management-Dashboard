import type { PreparedImage } from './examBuilderLogic';
import type { ImportImage, ImportImageConfidence, ImportPicture } from './examImportPictures';

// The picture review step of the Word import (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.4): what the
// teacher decides about each picture the file held, before the questions open in the builder. Pure and Firebase-free; the
// dialog keeps the list and calls these to change it. The rules: a picture the file could not give (EMF, too large,
// missing) or the picture check refused cannot be used and never blocks; a picture on no question is dropped unless it is
// moved to one and never blocks; every other picture (clear or check) needs Use, Move or Remove before Continue; two
// pictures used on one question block Continue until one is removed or moved.

export type ReviewDecision = 'undecided' | 'use' | 'removed';

/** A picture chosen in the review: the question of the import result it goes on, and the picture. */
export type ImportedPicture = { questionIndex: number; picture: PreparedImage };

export type ReviewItem = {
  /** The picture's index in the file (also its place in the list). */
  index: number;
  questionIndex: number | null;
  confidence: ImportImageConfidence;
  decision: ReviewDecision;
  /** The picture as it will be stored, once it has been through the picture check. */
  prepared: PreparedImage | null;
  /** Why the picture cannot be used, in words for the teacher. */
  refusal: string | null;
  /** The document's own description of the picture. */
  alt: string;
};

export type ReviewStatus = 'used' | 'removed' | 'dropped' | 'pending';

const PROBLEMS: Record<NonNullable<ImportPicture['problem']>, string> = {
  unsupported: 'This picture is in a format that cannot be imported (EMF or WMF). Save it as PNG or JPEG in Word.',
  too_large: 'This picture is too large to import. Crop it or choose a simpler one.',
  missing: 'This picture could not be found in the file or could not be read.',
};

/** The list to review: one item per picture the parser placed (or failed to place), in picture order. */
export function startReview(images: readonly ImportImage[], pictures: readonly ImportPicture[]): ReviewItem[] {
  return [...images]
    .sort((a, b) => a.index - b.index)
    .map((image): ReviewItem => {
      const picture = pictures[image.index];
      const refusal = !picture ? PROBLEMS.missing : picture.problem ? PROBLEMS[picture.problem] : picture.bytes === null ? PROBLEMS.missing : null;
      return {
        index: image.index,
        questionIndex: image.questionIndex,
        confidence: image.confidence,
        decision: refusal ? 'removed' : 'undecided',
        prepared: null,
        refusal,
        alt: picture?.alt ?? '',
      };
    });
}

const change = (items: readonly ReviewItem[], index: number, patch: (item: ReviewItem) => ReviewItem): ReviewItem[] =>
  items.map((item) => (item.index === index ? patch(item) : item));

const usable = (item: ReviewItem) => item.prepared !== null && item.refusal === null;

/** The result of the picture check for one picture: it is kept for review, or refused with a message. */
export type PrepareOutcome = { ok: true; picture: PreparedImage } | { ok: false; message: string };

export function applyPrepared(items: readonly ReviewItem[], index: number, outcome: PrepareOutcome): ReviewItem[] {
  return change(items, index, (item) =>
    outcome.ok
      ? { ...item, prepared: { ...outcome.picture, alt: item.alt }, refusal: null }
      : { ...item, prepared: null, refusal: outcome.message, decision: 'removed' },
  );
}

/**
 * A snapshot the teacher took of a PDF page, added to the review: it goes on the question they chose, is used (they placed it
 * on purpose) and still has to pass the picture check. `index` is its place in the dialog's list of pictures.
 */
export function addSnapshot(items: readonly ReviewItem[], index: number, questionIndex: number): ReviewItem[] {
  return [...items, { index, questionIndex, confidence: 'clear', decision: 'use', prepared: null, refusal: null, alt: '' }];
}

/** Use the picture on the question it was matched to (nothing for a picture on no question, or one that cannot be used). */
export function keepItem(items: readonly ReviewItem[], index: number): ReviewItem[] {
  return change(items, index, (item) => (usable(item) && item.questionIndex !== null ? { ...item, decision: 'use' } : item));
}

/** Put the picture on another question and use it there. */
export function moveItem(items: readonly ReviewItem[], index: number, questionIndex: number): ReviewItem[] {
  return change(items, index, (item) => (usable(item) ? { ...item, questionIndex, decision: 'use' } : item));
}

export function removeItem(items: readonly ReviewItem[], index: number): ReviewItem[] {
  return change(items, index, (item) => (item.refusal ? item : { ...item, decision: 'removed' }));
}

/** The shortcut: every clear picture that is ready and not yet decided is used. */
export function keepAllClear(items: readonly ReviewItem[]): ReviewItem[] {
  return items.map((item) => (item.confidence === 'clear' && item.decision === 'undecided' && usable(item) && item.questionIndex !== null ? { ...item, decision: 'use' } : item));
}

export function statusOf(item: ReviewItem): ReviewStatus {
  if (item.decision === 'use') return 'used';
  if (item.decision === 'removed') return 'removed';
  return item.questionIndex === null || item.confidence === 'unassigned' ? 'dropped' : 'pending';
}

/** The pictures that still need a decision (not those on no question, and not those that cannot be used). */
export function pending(items: readonly ReviewItem[]): number[] {
  return items.filter((item) => statusOf(item) === 'pending').map((item) => item.index);
}

/** For each question with more than one picture used on it, the pictures (a question keeps only one). */
export function conflicts(items: readonly ReviewItem[]): Record<number, number[]> {
  const byQuestion: Record<number, number[]> = {};
  for (const item of items) {
    if (item.decision === 'use' && item.questionIndex !== null) (byQuestion[item.questionIndex] ??= []).push(item.index);
  }
  return Object.fromEntries(Object.entries(byQuestion).filter(([, list]) => list.length > 1)) as Record<number, number[]>;
}

export const canContinue = (items: readonly ReviewItem[]): boolean => pending(items).length === 0 && Object.keys(conflicts(items)).length === 0;

/** The pictures to put on the questions: question index (of the import result) and the picture. */
export function chosen(items: readonly ReviewItem[]): ImportedPicture[] {
  return items.flatMap((item) => (item.decision === 'use' && item.prepared && item.questionIndex !== null ? [{ questionIndex: item.questionIndex, picture: item.prepared }] : []));
}

/**
 * The chosen pictures that go on a question of the list the import made, as `{ questionId, picture }` for the builder: a
 * picture whose question did not fit under the limit when the import was merged goes with it.
 */
export function picturesForMerged(
  imported: readonly { id: string }[],
  merged: readonly { id: string }[],
  pictures: readonly ImportedPicture[],
): { questionId: string; picture: PreparedImage }[] {
  const kept = new Set(merged.map((q) => q.id));
  return pictures.flatMap(({ questionIndex, picture }) => {
    const question = imported[questionIndex];
    return question && kept.has(question.id) ? [{ questionId: question.id, picture }] : [];
  });
}

/** One line for the step: how many are used, removed, and left out because they are on no question. */
export function summary(items: readonly ReviewItem[]): string {
  const used = items.filter((i) => statusOf(i) === 'used').length;
  const removed = items.filter((i) => statusOf(i) === 'removed').length;
  const dropped = items.filter((i) => statusOf(i) === 'dropped').length;
  const parts = [
    used > 0 && `${used} will be used`,
    removed > 0 && `${removed} removed`,
    dropped > 0 && `${dropped} will not be imported`,
  ].filter((p): p is string => p !== false);
  return parts.length > 0 ? `${parts.join(', ')}.` : 'No picture is used yet.';
}

/** "Question 7: Identify the tool shown…" for a picker or a card. */
export function questionLabel(question: { text: string }, index: number): string {
  const text = question.text.replace(/\s+/g, ' ').trim();
  return `Question ${index + 1}: ${text.length > 60 ? `${text.slice(0, 59).trimEnd()}…` : text}`;
}

/**
 * Puts every picture that has bytes, no refusal and no result yet through the picture check, one at a time (a picture is up to 10 MB
 * and the check may decode it), telling the caller after each. A check that throws is a refusal. `stop` ends the work early
 * (the dialog was closed, or another file was chosen).
 */
export async function preparePictures(
  items: readonly ReviewItem[],
  pictures: readonly ImportPicture[],
  prepare: (bytes: Uint8Array) => Promise<PrepareOutcome>,
  onResult: (index: number, outcome: PrepareOutcome) => void,
  stop: () => boolean = () => false,
): Promise<void> {
  const todo = items.filter((item) => item.refusal === null && item.prepared === null && pictures[item.index]?.bytes);
  for (const item of todo) {
    if (stop()) return;
    let outcome: PrepareOutcome;
    try {
      outcome = await prepare(pictures[item.index].bytes as Uint8Array);
    } catch {
      outcome = { ok: false, message: 'This picture could not be read. Choose another one.' };
    }
    if (stop()) return;
    onResult(item.index, outcome);
  }
}
