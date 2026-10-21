import {
  EXAM_LIMITS,
  type ExamAnswerMode,
  type ExamCategoryType,
  type ExamQuestion,
} from '@/types/exams';
import { round2 } from './examScoring';

// Checks an online exam's questions and answer key (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.3 and
// §6.1). Pure and Firebase-free: the builder shows the issues next to each question, publishing is blocked by
// them, and Auto-Grade is allowed only when there are none. Issue messages are written for teachers.

export type ExamIssue = {
  code: string;
  message: string;
  questionId?: string;
};

const issue = (code: string, message: string, questionId?: string): ExamIssue => ({ code, message, questionId });

const isHalfStep = (n: number): boolean => Math.abs(n / EXAM_LIMITS.pointsStep - Math.round(n / EXAM_LIMITS.pointsStep)) < 1e-9;

/**
 * Problems with the questions themselves: how many there are, their texts and options, the kind of each against
 * the answer mode, and their points. The answer key is checked separately (validateKey).
 */
export function validateQuestions(
  questions: readonly ExamQuestion[],
  answerMode: ExamAnswerMode | undefined,
): ExamIssue[] {
  const issues: ExamIssue[] = [];
  if (!answerMode) issues.push(issue('answer_mode_missing', 'Choose an answer mode.'));
  if (questions.length === 0) issues.push(issue('no_questions', 'Add at least one question.'));
  if (questions.length > EXAM_LIMITS.maxQuestions) {
    issues.push(issue('too_many_questions', `An exam can have at most ${EXAM_LIMITS.maxQuestions} questions.`));
  }

  const seenIds = new Set<string>();
  questions.forEach((q, index) => {
    const n = index + 1;
    const at = (code: string, message: string) => issue(code, `Question ${n}: ${message}`, q.id);

    if (!q.id) issues.push(at('question_id_missing', 'has no id.'));
    else if (seenIds.has(q.id)) issues.push(at('question_id_duplicate', 'shares its id with another question.'));
    seenIds.add(q.id);

    const text = q.text.trim();
    if (text.length === 0) issues.push(at('question_text_empty', 'needs question text.'));
    else if (text.length > EXAM_LIMITS.questionTextMax) {
      issues.push(at('question_text_long', `text must be ${EXAM_LIMITS.questionTextMax} characters or fewer.`));
    }

    if (q.options.length < EXAM_LIMITS.minOptions || q.options.length > EXAM_LIMITS.maxOptions) {
      issues.push(at('option_count', `needs ${EXAM_LIMITS.minOptions} to ${EXAM_LIMITS.maxOptions} options.`));
    }
    const optionIds = new Set<string>();
    q.options.forEach((o, optionIndex) => {
      const label = `option ${optionIndex + 1}`;
      if (!o.id || optionIds.has(o.id)) issues.push(at('option_id', `${label} has a missing or repeated id.`));
      optionIds.add(o.id);
      const optionText = o.text.trim();
      if (optionText.length === 0) issues.push(at('option_text_empty', `${label} is empty.`));
      else if (optionText.length > EXAM_LIMITS.optionTextMax) {
        issues.push(at('option_text_long', `${label} must be ${EXAM_LIMITS.optionTextMax} characters or fewer.`));
      }
    });

    if (q.kind !== 'single' && q.kind !== 'multiple') issues.push(at('kind_invalid', 'has no valid kind.'));
    else if (answerMode === 'single' && q.kind !== 'single') {
      issues.push(at('kind_mismatch', 'must have a single correct answer in a Single-answer exam.'));
    } else if (answerMode === 'multiple' && q.kind !== 'multiple') {
      issues.push(at('kind_mismatch', 'must have several correct answers in a Multiple-answer exam.'));
    }

    if (
      !Number.isFinite(q.points) ||
      q.points < EXAM_LIMITS.minPoints ||
      q.points > EXAM_LIMITS.maxPoints ||
      !isHalfStep(q.points)
    ) {
      issues.push(
        at('points', `points must be from ${EXAM_LIMITS.minPoints} to ${EXAM_LIMITS.maxPoints}, in steps of ${EXAM_LIMITS.pointsStep}.`),
      );
    }
  });

  // 'Both' means the exam has some single-answer and some multiple-answer questions.
  if (answerMode === 'both' && questions.length > 0) {
    const hasSingle = questions.some((q) => q.kind === 'single');
    const hasMultiple = questions.some((q) => q.kind === 'multiple');
    if (!hasSingle || !hasMultiple) {
      issues.push(
        issue(
          'both_needs_each_kind',
          "A 'Both' exam needs at least one single-answer question and at least one multiple-answer question. Use Single-answer or Multiple-answer if every question is the same kind.",
        ),
      );
    }
  }
  return issues;
}

/**
 * Problems with the answer key against the questions: every question needs its correct options, each must be one
 * of its options, a single question has exactly one and a multiple question at least two, and the key may not
 * name a question that does not exist. `answers` is questionId → correct option ids.
 */
export function validateKey(
  questions: readonly ExamQuestion[],
  answers: Readonly<Record<string, readonly string[]>> | undefined,
): ExamIssue[] {
  const issues: ExamIssue[] = [];
  const key = answers ?? {};
  const questionIds = new Set(questions.map((q) => q.id));

  questions.forEach((q, index) => {
    const at = (code: string, message: string) => issue(code, `Question ${index + 1}: ${message}`, q.id);
    const correct = [...new Set(key[q.id] ?? [])];
    if (correct.length === 0) {
      issues.push(at('key_missing', 'has no correct answer in the key.'));
      return;
    }
    const optionIds = new Set(q.options.map((o) => o.id));
    if (correct.some((id) => !optionIds.has(id))) {
      issues.push(at('key_unknown_option', 'the key names an option that does not exist.'));
      return;
    }
    if (q.kind === 'single' && correct.length !== 1) {
      issues.push(at('key_single_count', 'is single-answer, so it needs exactly one correct option.'));
    }
    if (q.kind === 'multiple' && correct.length < 2) {
      issues.push(at('key_multiple_count', 'is multiple-answer, so it needs at least two correct options.'));
    }
  });

  for (const id of Object.keys(key)) {
    if (!questionIds.has(id)) issues.push(issue('key_unknown_question', 'The key has an answer for a question that no longer exists.', id));
  }
  return issues;
}

/** True when there is at least one question and the key has no problems. */
export function isKeyComplete(
  questions: readonly ExamQuestion[],
  answers: Readonly<Record<string, readonly string[]>> | undefined,
): boolean {
  return questions.length > 0 && validateKey(questions, answers).length === 0;
}

/** The total points of the exam (rounded to two decimals). */
export function totalPointsOf(questions: readonly ExamQuestion[]): number {
  return round2(questions.reduce((sum, q) => sum + q.points, 0));
}

/**
 * Why Auto-Grade cannot be used, as a list for the form: the category must be Multiple Choice (the only category
 * that can be graded automatically for now), the questions must be valid and the key complete. Empty means it can
 * be ticked.
 */
export function autoGradeBlockers(
  categoryType: ExamCategoryType | undefined,
  questions: readonly ExamQuestion[],
  answers: Readonly<Record<string, readonly string[]>> | undefined,
  answerMode: ExamAnswerMode | undefined,
): ExamIssue[] {
  const blockers: ExamIssue[] = [];
  if (categoryType !== 'multiple_choice') {
    blockers.push(issue('category', 'Only Multiple Choice exams can be graded automatically.'));
  }
  blockers.push(...validateQuestions(questions, answerMode));
  blockers.push(...validateKey(questions, answers));
  return blockers;
}

/** Auto-grading runs only when the teacher opted in and nothing blocks it. */
export function canAutoGrade(
  exam: { categoryType?: ExamCategoryType; autoGrade?: boolean; answerMode?: ExamAnswerMode },
  questions: readonly ExamQuestion[],
  answers: Readonly<Record<string, readonly string[]>> | undefined,
): boolean {
  return (
    exam.autoGrade === true &&
    autoGradeBlockers(exam.categoryType, questions, answers, exam.answerMode).length === 0
  );
}
