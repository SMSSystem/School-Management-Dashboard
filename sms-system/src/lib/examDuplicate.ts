import { EXAM_LIMITS, type ExamKeyAnswers, type ExamQuestion } from '@/types/exams';
import { contentCounts } from './examBuilderLogic';

// Duplicating an online exam (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.7): the Add Exam form opens filled
// in from the source, the person changes the class, date and window, and the questions and key are copied when
// they press Create. Pure and Firebase-free.

// The fields copied from the source: what the exam is about and how it is set up. The date and the window are
// left blank (the form fills them in), and the status, counts, key revision and statistics start afresh. The picture
// pack count and bytes are carried only so the form's budget note counts the pictures that will be copied; the copy
// writes the real values itself (copyExamContent).
const COPIED_FIELDS = [
  'imagePacks',
  'imageBytes',
  'termId',
  'subjectId',
  'classId',
  'teacherId',
  'startTime',
  'room',
  'duration',
  'valueType',
  'valueTypeLabel',
  'categoryType',
  'answerMode',
  'scoringMode',
  'autoGrade',
  'releaseMode',
  'shuffle',
  'checkpointMinutes',
] as const;

/** Only an online exam has content to copy. */
export function canDuplicate(exam: { online?: boolean }): boolean {
  return exam.online === true;
}

/** The form's starting values for a copy of `source`, with `duplicateOf` naming the exam the content comes from. */
export function duplicateDefaults(source: Record<string, unknown> & { id: string }): Record<string, unknown> {
  const out: Record<string, unknown> = { online: true, duplicateOf: source.id };
  for (const field of COPIED_FIELDS) if (source[field] !== undefined) out[field] = source[field];
  const title = typeof source.title === 'string' ? source.title.trim() : '';
  out.title = `Copy of ${title || 'exam'}`.slice(0, EXAM_LIMITS.titleMax);
  out.date = '';
  return out;
}

/** The content written to the new exam: the same questions and key, and the counts for the exam document. */
export function copiedContent(
  questions: readonly ExamQuestion[],
  answers: ExamKeyAnswers | undefined,
): { questions: ExamQuestion[]; answers: ExamKeyAnswers; questionCount: number; totalPoints: number } {
  const ids = new Set(questions.map((q) => q.id));
  const copiedAnswers: ExamKeyAnswers = {};
  for (const [id, correct] of Object.entries(answers ?? {})) if (ids.has(id)) copiedAnswers[id] = [...correct];
  const copiedQuestions = questions.map((q) => ({ ...q, options: q.options.map((o) => ({ ...o })), ...(q.image && { image: { ...q.image } }) }));
  return { questions: copiedQuestions, answers: copiedAnswers, ...contentCounts(copiedQuestions) };
}
