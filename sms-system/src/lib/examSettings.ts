import {
  EXAM_ANSWER_MODES,
  EXAM_LIMITS,
  EXAM_RELEASE_MODES,
  EXAM_SCORING_MODES,
  EXAM_SELECTABLE_CATEGORIES,
  EXAM_CATEGORY_TYPES,
  EXAM_VALUE_TYPES,
  type ExamAnswerMode,
  type ExamCategoryType,
  type ExamQuestion,
  type ExamReleaseMode,
  type ExamScoringMode,
  type ExamStatus,
  type ExamValueType,
} from '@/types/exams';
import { validateKey, validateQuestions, type ExamIssue } from './examKeyValidation';

// The checks the exam form, the builder and the staff screens share for an online exam's settings and status
// (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.1, §4.2 and §7). Pure and Firebase-free; times are
// milliseconds since 1970. firestore.rules checks the same ranges and enums on write.

const MINUTE_MS = 60_000;

export type ExamSettingsInput = {
  title?: string;
  valueType?: ExamValueType;
  valueTypeLabel?: string;
  categoryType?: ExamCategoryType;
  answerMode?: ExamAnswerMode;
  durationMinutes?: number;
  opensAtMs?: number;
  closesAtMs?: number;
  scoringMode?: ExamScoringMode;
  autoGrade?: boolean;
  releaseMode?: ExamReleaseMode;
  releaseAtMs?: number | null;
  checkpointMinutes?: number;
};

const issue = (code: string, message: string): ExamIssue => ({ code, message });
const inRange = (n: number | undefined, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

/** Problems with an online exam's settings, in words for the form. Empty means the settings are valid. */
export function validateExamSettings(s: ExamSettingsInput): ExamIssue[] {
  const issues: ExamIssue[] = [];

  const title = (s.title ?? '').trim();
  if (title.length === 0) issues.push(issue('title', 'Give the exam a title.'));
  else if (title.length > EXAM_LIMITS.titleMax) issues.push(issue('title', `The title must be ${EXAM_LIMITS.titleMax} characters or fewer.`));

  if (!s.valueType || !EXAM_VALUE_TYPES.includes(s.valueType)) issues.push(issue('value_type', 'Choose a type.'));
  else if (s.valueType === 'other') {
    const label = (s.valueTypeLabel ?? '').trim();
    if (label.length === 0 || label.length > EXAM_LIMITS.otherLabelMax) {
      issues.push(issue('value_type_label', `Name the type, in ${EXAM_LIMITS.otherLabelMax} characters or fewer.`));
    }
  }

  if (!s.categoryType || !EXAM_CATEGORY_TYPES.includes(s.categoryType)) issues.push(issue('category', 'Choose a category.'));
  else if (!EXAM_SELECTABLE_CATEGORIES.includes(s.categoryType)) {
    issues.push(issue('category_unavailable', 'That category is not available yet. Online exams are Multiple Choice for now.'));
  } else if (s.categoryType === 'multiple_choice' && (!s.answerMode || !EXAM_ANSWER_MODES.includes(s.answerMode))) {
    issues.push(issue('answer_mode', 'Choose an answer mode.'));
  }

  if (!inRange(s.durationMinutes, EXAM_LIMITS.minDurationMinutes, EXAM_LIMITS.maxDurationMinutes)) {
    issues.push(issue('duration', `The duration must be a whole number of minutes from ${EXAM_LIMITS.minDurationMinutes} to ${EXAM_LIMITS.maxDurationMinutes}.`));
  }

  if (s.opensAtMs === undefined || s.closesAtMs === undefined) issues.push(issue('window', 'Set when the exam opens and closes.'));
  else if (s.closesAtMs <= s.opensAtMs) issues.push(issue('window_order', 'The exam must close after it opens.'));
  else if (typeof s.durationMinutes === 'number' && s.closesAtMs - s.opensAtMs < s.durationMinutes * MINUTE_MS) {
    issues.push(issue('window_short', 'The window is shorter than the duration, so no student could finish.'));
  }

  // Partial credit only matters when a question can have several correct answers.
  if (s.answerMode && s.answerMode !== 'single' && (!s.scoringMode || !EXAM_SCORING_MODES.includes(s.scoringMode))) {
    issues.push(issue('scoring_mode', 'Choose how multiple-answer questions are scored.'));
  }

  if (!s.releaseMode || !EXAM_RELEASE_MODES.includes(s.releaseMode)) issues.push(issue('release_mode', 'Choose when students see their score.'));
  else if (s.releaseMode === 'scheduled') {
    if (typeof s.releaseAtMs !== 'number') issues.push(issue('release_at', 'Set the date and time scores are released.'));
    else if (s.closesAtMs !== undefined && s.releaseAtMs < s.closesAtMs) {
      issues.push(issue('release_before_close', 'Scores cannot be released before the exam closes.'));
    }
  }

  if (s.checkpointMinutes !== undefined && !inRange(s.checkpointMinutes, EXAM_LIMITS.minCheckpointMinutes, EXAM_LIMITS.maxCheckpointMinutes)) {
    issues.push(issue('checkpoint', `Save answers every ${EXAM_LIMITS.minCheckpointMinutes} to ${EXAM_LIMITS.maxCheckpointMinutes} minutes.`));
  }
  return issues;
}

/**
 * Whether the status may change from one to another. A draft becomes published, and a published exam can go back
 * to a draft only while no student has started. Published becomes closed (early). A closed exam can be reopened
 * only while its window has not ended. Closed becomes finalized. Finalized is the end.
 */
export function canTransition(
  from: ExamStatus,
  to: ExamStatus,
  ctx: { hasAttempts: boolean; nowMs: number; closesAtMs?: number },
): boolean {
  if (from === 'draft') return to === 'published';
  if (from === 'published') return to === 'closed' || (to === 'draft' && !ctx.hasAttempts);
  if (from === 'closed') {
    if (to === 'finalized') return true;
    return to === 'published' && ctx.closesAtMs !== undefined && ctx.nowMs < ctx.closesAtMs;
  }
  return false;
}

/**
 * Everything that stops an exam from being published: invalid settings, invalid questions, a window that has
 * already ended and, when Auto-Grade is on, an incomplete answer key. Without Auto-Grade the key may be unfinished
 * (staff mark by hand).
 */
export function publishBlockers(
  settings: ExamSettingsInput,
  questions: readonly ExamQuestion[],
  keyAnswers: Readonly<Record<string, readonly string[]>> | undefined,
  nowMs: number,
): ExamIssue[] {
  const blockers = [...validateExamSettings(settings), ...validateQuestions(questions, settings.answerMode)];
  if (settings.closesAtMs !== undefined && settings.closesAtMs <= nowMs) {
    blockers.push(issue('window_passed', 'The closing time has already passed.'));
  }
  if (settings.autoGrade === true) blockers.push(...validateKey(questions, keyAnswers));
  return blockers;
}
