import type { ExamOrder, ExamQuestion } from '@/types/exams';

// A student's own order of an online exam's questions and options (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md
// §4.5). The order is made once, when the attempt starts, and saved on the attempt so a refresh or a sign-in on
// another device shows the same order. Answers are stored by question and option id, never by position, so
// shuffling never affects grading. Pure and Firebase-free.

/** A source of numbers in [0, 1). */
export type Rng = () => number;

/** The browser's secure random numbers; Math.random where they are not available. */
export function defaultRng(): Rng {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  }
  return Math.random;
}

/** A repeatable generator for tests (mulberry32). */
export function seededRandom(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shuffled copy (Fisher–Yates); the input is not changed. */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The order for a new attempt: shuffled when the exam shuffles, otherwise the order the teacher wrote. */
export function makeAttemptOrder(
  questions: readonly ExamQuestion[],
  shuffle: boolean,
  rng: Rng = defaultRng(),
): ExamOrder {
  const arrange = <T>(items: readonly T[]) => (shuffle ? shuffled(items, rng) : [...items]);
  const options: Record<string, string[]> = {};
  for (const q of questions) options[q.id] = arrange(q.options.map((o) => o.id));
  return { questions: arrange(questions.map((q) => q.id)), options };
}

const reconcileIds = (stored: readonly string[] | undefined, current: readonly string[]): string[] => {
  const known = new Set(current);
  const kept = (stored ?? []).filter((id, index, all) => known.has(id) && all.indexOf(id) === index);
  const have = new Set(kept);
  return [...kept, ...current.filter((id) => !have.has(id))];
};

/**
 * A stored order made valid for the questions as they are now. Ids the exam no longer has are dropped and new ids
 * are added at the end in the teacher's order, so a key correction made while students are sitting never breaks a
 * running attempt. A missing order becomes the natural order.
 */
export function reconcileOrder(order: ExamOrder | undefined, questions: readonly ExamQuestion[]): ExamOrder {
  const options: Record<string, string[]> = {};
  for (const q of questions) {
    options[q.id] = reconcileIds(
      order?.options?.[q.id],
      q.options.map((o) => o.id),
    );
  }
  return { questions: reconcileIds(order?.questions, questions.map((q) => q.id)), options };
}

/** The questions, and each question's options, in the student's order (after reconciling it). */
export function orderQuestions(questions: readonly ExamQuestion[], order: ExamOrder | undefined): ExamQuestion[] {
  const fixed = reconcileOrder(order, questions);
  const byId = new Map(questions.map((q) => [q.id, q]));
  return fixed.questions.map((id) => {
    const q = byId.get(id) as ExamQuestion;
    const optionById = new Map(q.options.map((o) => [o.id, o]));
    return { ...q, options: fixed.options[id].map((optionId) => optionById.get(optionId)!) };
  });
}
