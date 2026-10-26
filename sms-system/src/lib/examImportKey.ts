import type { ImportResult } from './examImport';

// The answers a teacher chooses for an import that has none in the file (a Google Forms printout carries no key), as far as
// the import dialog needs: which options are chosen for each question, and the questions of the result with those answers
// in. Pure. A question still without an answer after this keeps the "no correct answer" warning, and the builder will not
// let the exam be published until it has one.

/** The chosen option ids by question id. */
export type KeyChoices = Readonly<Record<string, readonly string[]>>;

const NO_ANSWER = 'No correct answer is given';

/** One option chosen or cleared: a single question keeps the one option, a multiple question toggles. */
export function toggleChoice(choices: KeyChoices, question: { id: string; kind: 'single' | 'multiple' }, optionId: string): KeyChoices {
  const now = choices[question.id] ?? [];
  const next = question.kind === 'single' ? [optionId] : now.includes(optionId) ? now.filter((id) => id !== optionId) : [...now, optionId];
  return { ...choices, [question.id]: next };
}

/** The choices that name a real option of the question (a single question keeps its first), by question id. */
function validChoices(result: ImportResult, choices: KeyChoices): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const q of result.questions) {
    const ids = (choices[q.id] ?? []).filter((id, at, all) => q.options.some((o) => o.id === id) && all.indexOf(id) === at);
    if (ids.length > 0) out[q.id] = q.kind === 'single' ? ids.slice(0, 1) : ids;
  }
  return out;
}

/** How many questions have no answer chosen. */
export function unanswered(result: ImportResult, choices: KeyChoices): number {
  const valid = validChoices(result, choices);
  return result.questions.filter((q) => !valid[q.id]).length;
}

/** The result with the chosen answers in the questions, and the "no correct answer" warning gone for each question that now has one. */
export function applyKeys(result: ImportResult, choices: KeyChoices): ImportResult {
  const valid = validChoices(result, choices);
  const questions = result.questions.map((q) => (valid[q.id] ? { ...q, correct: valid[q.id] } : q));
  const answered = new Set(result.questions.flatMap((q, i) => (valid[q.id] ? [i + 1] : [])));
  const warnings = result.warnings.filter((w) => !(w.question !== undefined && answered.has(w.question) && w.message.startsWith(NO_ANSWER)));
  return { ...result, questions, warnings };
}
