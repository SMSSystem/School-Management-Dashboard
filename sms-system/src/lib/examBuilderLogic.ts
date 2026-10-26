import {
  EXAM_LIMITS,
  type ExamAnswerMode,
  type ExamKeyAnswers,
  type ExamQuestion,
  type ExamQuestionKind,
  type ExamStatus,
} from '@/types/exams';
import { totalPointsOf, type ExamIssue } from './examKeyValidation';
import { assignToPacks, findDuplicate, packStats, referencesOf, withoutOrphans, type PackMap } from './examImagePack';
import { defaultRng, type Rng } from './examShuffle';

// What the exam builder does to its list of questions (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.3). The
// builder edits one list in which each question carries its correct options; saving splits it into the questions
// document (what a student reads) and the answer key (staff only). Pure and Firebase-free; every function returns
// a new list and leaves its input alone.

/** A question together with the ids of its correct options. */
export type BuilderQuestion = ExamQuestion & { correct: string[] };

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** A short random id such as `q7k2m9xa`. Stable once made; unique enough within one exam. */
export function newId(prefix: string, rng: Rng = defaultRng()): string {
  let out = prefix;
  for (let i = 0; i < 8; i += 1) out += ID_CHARS[Math.floor(rng() * ID_CHARS.length)];
  return out;
}

/** What kind a new question starts as for an exam's answer mode. */
export function defaultKind(answerMode: ExamAnswerMode | undefined): ExamQuestionKind {
  return answerMode === 'multiple' ? 'multiple' : 'single';
}

/** A blank question with two empty options and one point. */
export function newQuestion(kind: ExamQuestionKind, rng: Rng = defaultRng()): BuilderQuestion {
  return {
    id: newId('q', rng),
    text: '',
    kind,
    options: [
      { id: newId('o', rng), text: '' },
      { id: newId('o', rng), text: '' },
    ],
    points: 1,
    correct: [],
  };
}

export function addOption(q: BuilderQuestion, rng: Rng = defaultRng()): BuilderQuestion {
  if (q.options.length >= EXAM_LIMITS.maxOptions) return q;
  return { ...q, options: [...q.options, { id: newId('o', rng), text: '' }] };
}

/** Removes an option (and its mark as correct), keeping at least the minimum number of options. */
export function removeOption(q: BuilderQuestion, optionId: string): BuilderQuestion {
  if (q.options.length <= EXAM_LIMITS.minOptions || !q.options.some((o) => o.id === optionId)) return q;
  return {
    ...q,
    options: q.options.filter((o) => o.id !== optionId),
    correct: q.correct.filter((id) => id !== optionId),
  };
}

export function setOptionText(q: BuilderQuestion, optionId: string, text: string): BuilderQuestion {
  return { ...q, options: q.options.map((o) => (o.id === optionId ? { ...o, text } : o)) };
}

/** A single question has one correct option (choosing another replaces it); a multiple question toggles. */
export function toggleCorrect(q: BuilderQuestion, optionId: string): BuilderQuestion {
  if (!q.options.some((o) => o.id === optionId)) return q;
  if (q.kind === 'single') return { ...q, correct: [optionId] };
  return {
    ...q,
    correct: q.correct.includes(optionId) ? q.correct.filter((id) => id !== optionId) : [...q.correct, optionId],
  };
}

/** Changes a question's kind; a single question keeps only its first correct option (in option order). */
export function setKind(q: BuilderQuestion, kind: ExamQuestionKind): BuilderQuestion {
  if (q.kind === kind) return q;
  if (kind === 'multiple') return { ...q, kind };
  const first = q.options.find((o) => q.correct.includes(o.id));
  return { ...q, kind, correct: first ? [first.id] : [] };
}

/** Moves a question up (-1) or down (+1); out-of-range moves change nothing. */
export function moveQuestion<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const out = [...list];
  [out[index], out[target]] = [out[target], out[index]];
  return out;
}

/** A copy of a question, with new ids, placed straight after it; unchanged when the exam is full. */
export function duplicateQuestion(list: readonly BuilderQuestion[], index: number, rng: Rng = defaultRng()): BuilderQuestion[] {
  const source = list[index];
  if (!source || list.length >= EXAM_LIMITS.maxQuestions) return [...list];
  const idMap = new Map(source.options.map((o) => [o.id, newId('o', rng)]));
  const copy: BuilderQuestion = {
    ...source,
    id: newId('q', rng),
    options: source.options.map((o) => ({ ...o, id: idMap.get(o.id) as string })),
    correct: source.correct.map((id) => idMap.get(id) as string),
  };
  return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
}

/** Splits the builder's list into the questions document's items and the key (questions without answers are left out). */
export function splitDraft(draft: readonly BuilderQuestion[]): { questions: ExamQuestion[]; answers: ExamKeyAnswers } {
  const answers: ExamKeyAnswers = {};
  const questions = draft.map(({ correct, ...question }) => {
    if (correct.length > 0) answers[question.id] = [...correct];
    return question;
  });
  return { questions, answers };
}

/** The builder's list from the saved questions and key. */
export function joinDraft(questions: readonly ExamQuestion[], answers: Readonly<Record<string, readonly string[]>> | undefined): BuilderQuestion[] {
  return questions.map((q) => ({ ...q, options: q.options.map((o) => ({ ...o })), correct: [...(answers?.[q.id] ?? [])] }));
}

/** Do two keys name the same correct options for every question (order ignored)? */
export function sameAnswers(
  a: Readonly<Record<string, readonly string[]>> | undefined,
  b: Readonly<Record<string, readonly string[]>> | undefined,
): boolean {
  const left = a ?? {};
  const right = b ?? {};
  const ids = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const id of ids) {
    const x = new Set(left[id] ?? []);
    const y = new Set(right[id] ?? []);
    if (x.size !== y.size || [...x].some((v) => !y.has(v))) return false;
  }
  return true;
}

/** True when the two lists differ in anything the builder edits. */
export function draftChanged(saved: readonly BuilderQuestion[], current: readonly BuilderQuestion[]): boolean {
  if (saved.length !== current.length) return true;
  const a = splitDraft(saved);
  const b = splitDraft(current);
  return JSON.stringify(a.questions) !== JSON.stringify(b.questions) || !sameAnswers(a.answers, b.answers);
}

/** The issues of a validation run, grouped by question; those about the exam as a whole are under `general`. */
export function groupIssues(issues: readonly ExamIssue[]): { byQuestion: Record<string, ExamIssue[]>; general: ExamIssue[] } {
  const byQuestion: Record<string, ExamIssue[]> = {};
  const general: ExamIssue[] = [];
  for (const i of issues) {
    if (i.questionId) (byQuestion[i.questionId] ??= []).push(i);
    else general.push(i);
  }
  return { byQuestion, general };
}

export type EditMode = 'full' | 'key_only' | 'read_only';

/**
 * What the builder allows. Everything is editable while the exam is a draft, or while it is published with nobody
 * started and the window not yet open. After that (an attempt exists, the window has opened, or the exam is
 * closed) students have seen the questions, so only the correct answers may change, which makes existing grades
 * show "re-grade needed". A finalized exam cannot be edited.
 */
export function editMode(
  exam: { status?: ExamStatus; opensAtMs?: number },
  ctx: { hasAttempts: boolean; nowMs: number },
): EditMode {
  if (exam.status === 'finalized') return 'read_only';
  if (exam.status === 'closed') return 'key_only';
  if (exam.status !== 'published') return 'full';
  const beforeOpening = exam.opensAtMs === undefined || ctx.nowMs < exam.opensAtMs;
  return !ctx.hasAttempts && beforeOpening ? 'full' : 'key_only';
}

/** The key revision to save: it goes up by one only when the answers were corrected in key-only mode. */
export function nextKeyRevision(current: number | undefined, mode: EditMode, answersChanged: boolean): number {
  const revision = current && current >= 1 ? current : 1;
  return mode === 'key_only' && answersChanged ? revision + 1 : revision;
}

/**
 * In key-only mode the questions as students saw them stay as they are: the saved questions, with only the
 * correct options taken from the edited list (matched by question id).
 */
export function applyKeyCorrections(saved: readonly BuilderQuestion[], edited: readonly BuilderQuestion[]): BuilderQuestion[] {
  const correctById = new Map(edited.map((q) => [q.id, q.correct]));
  return saved.map((q) => ({ ...q, correct: [...(correctById.get(q.id) ?? q.correct)] }));
}

/** A picture ready to put in a pack: what the canvas module (examImageCanvas.ts) returns. */
export type PreparedImage = {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  /** The data URL. */
  data: string;
  bytes: number;
  w: number;
  h: number;
  exact: boolean;
  /** What the builder shows under it, such as "340 KB, kept exactly". */
  report: string;
};

/**
 * Puts a prepared picture on a question (replacing its picture), in the packs: the same picture already stored is reused,
 * else it goes to the first pack with room. The picture the question had stays in the packs until the save, which leaves
 * out what no question refers to; its room is taken back here so a replaced picture does not hold a pack. The alt text
 * and the decorative tick are kept.
 */
export function addPicture(
  packs: PackMap,
  draft: readonly BuilderQuestion[],
  questionId: string,
  picture: PreparedImage,
  rng: Rng = defaultRng(),
): { packs: PackMap; draft: BuilderQuestion[] } {
  const target = draft.find((q) => q.id === questionId);
  if (!target) return { packs, draft: [...draft] };
  const base = withoutOrphans(packs, referencesOf(draft.map((q) => (q.id === questionId ? { image: undefined } : q))));
  const found = findDuplicate(base, { mime: picture.mime, data: picture.data });
  let next = base;
  let place = found;
  if (!place) {
    const id = newId('i', rng);
    const assigned = assignToPacks(base, [{ id, mime: picture.mime, data: picture.data }], []);
    next = assigned.packs;
    place = { pack: assigned.placement[id], id };
  }
  const image = {
    id: place.id,
    pack: place.pack,
    w: picture.w,
    h: picture.h,
    bytes: picture.bytes,
    exact: picture.exact,
    alt: target.image?.decorative ? '' : (target.image?.alt ?? ''),
    ...(target.image?.decorative && { decorative: true }),
  };
  return { packs: next, draft: draft.map((q) => (q.id === questionId ? { ...q, image } : q)) };
}

/** A question without its picture (the picture is swept from the packs at the next save). */
export function removePicture(q: BuilderQuestion): BuilderQuestion {
  if (!q.image) return q;
  const out = { ...q };
  delete out.image;
  return out;
}

/** The alt text and the decorative tick of a question's picture; ticking decorative empties the text. */
export function setPictureAlt(q: BuilderQuestion, alt: string, decorative: boolean): BuilderQuestion {
  if (!q.image) return q;
  const image = { ...q.image, alt: decorative ? '' : alt };
  delete image.decorative;
  return { ...q, image: decorative ? { ...image, decorative: true } : image };
}

/** One line for the builder about the pictures the questions refer to: how many, and what a student downloads. Null without any. */
export function picturesNote(packs: PackMap, questions: readonly Pick<ExamQuestion, 'image'>[]): string | null {
  const used = withoutOrphans(packs, referencesOf(questions));
  const stats = packStats(used);
  if (stats.count === 0) return null;
  const pictures = Object.values(used).reduce((n, p) => n + Object.keys(p.images).length, 0);
  const mb = Math.round((stats.bytes / (1024 * 1024)) * 10) / 10;
  return `${pictures} ${pictures === 1 ? 'picture' : 'pictures'}: about ${mb} MB downloaded per student.`;
}

/** The numbers stored on the exam document. */
export function contentCounts(questions: readonly ExamQuestion[]): { questionCount: number; totalPoints: number } {
  return { questionCount: questions.length, totalPoints: totalPointsOf(questions) };
}
