// Exams, including the online multiple-choice exams of docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md.
// Part of what src/lib/firebase.ts re-exports, so `import { X } from '@/lib/firebase'` keeps working.
// Keep this file free of imports from firebase.ts: it holds shapes and constants, not the Firebase app.

import type { Timestamp } from 'firebase/firestore';

// ── Value type (what kind of assessment it is) ──────────────────────────────

export const EXAM_VALUE_TYPES = [
  'quiz', 'test', 'exam', 'end_of_term', 'end_of_year', 'mock', 'open_book', 'other',
] as const;

export type ExamValueType = (typeof EXAM_VALUE_TYPES)[number];

export const EXAM_VALUE_TYPE_LABELS: Record<ExamValueType, string> = {
  quiz: 'Quiz',
  test: 'Test',
  exam: 'Exam',
  end_of_term: 'End of term Exam',
  end_of_year: 'End of year Exam',
  mock: 'Mock Exam',
  open_book: 'Open Book',
  other: 'Other',
};

// ── Category (how the questions are answered) ───────────────────────────────

export const EXAM_CATEGORY_TYPES = [
  'multiple_choice', 'true_false', 'fill_in_the_blank', 'matching', 'short_answer', 'extended_response',
  'problem_solving', 'oral_performance', 'interactive', 'drag_and_drop', 'mixed', 'other',
] as const;

export type ExamCategoryType = (typeof EXAM_CATEGORY_TYPES)[number];

export const EXAM_CATEGORY_LABELS: Record<ExamCategoryType, string> = {
  multiple_choice: 'Multiple Choice',
  true_false: 'True-or-False',
  fill_in_the_blank: 'Fill-in-the-blank',
  matching: 'Matching (Corresponding Pairs)',
  short_answer: 'Short Answer',
  extended_response: 'Extended Response',
  problem_solving: 'Problem Solving / Computational',
  oral_performance: 'Oral / Performance',
  interactive: 'Interactive',
  drag_and_drop: 'Drag-and-drop',
  mixed: 'Mixed',
  other: 'Other',
};

// The category dropdown lists every category, but only these can be chosen for now; the others are shown
// disabled ("coming soon").
export const EXAM_SELECTABLE_CATEGORIES: readonly ExamCategoryType[] = ['multiple_choice'];

// ── Multiple-choice answer mode ─────────────────────────────────────────────

export const EXAM_ANSWER_MODES = ['single', 'multiple', 'both'] as const;

export type ExamAnswerMode = (typeof EXAM_ANSWER_MODES)[number];

export const EXAM_ANSWER_MODE_LABELS: Record<ExamAnswerMode, string> = {
  single: 'Single-answer',
  multiple: 'Multiple-answer',
  both: 'Both',
};

export const EXAM_ANSWER_MODE_DESCRIPTIONS: Record<ExamAnswerMode, string> = {
  single: 'Every question has exactly one correct answer.',
  multiple: 'Every question has at least two correct answers (select all that apply).',
  both: 'Some questions have one correct answer and others have several.',
};

// A single question's kind: how many options may be chosen.
export type ExamQuestionKind = 'single' | 'multiple';

// ── Status, scoring, release ────────────────────────────────────────────────

export const EXAM_STATUSES = ['draft', 'published', 'closed', 'finalized'] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  closed: 'Closed',
  finalized: 'Finalized',
};

export const EXAM_SCORING_MODES = ['all_or_nothing', 'partial'] as const;
export type ExamScoringMode = (typeof EXAM_SCORING_MODES)[number];

export const EXAM_SCORING_MODE_LABELS: Record<ExamScoringMode, string> = {
  all_or_nothing: 'All or nothing',
  partial: 'Partial credit',
};

export const EXAM_RELEASE_MODES = ['auto', 'scheduled', 'manual'] as const;
export type ExamReleaseMode = (typeof EXAM_RELEASE_MODES)[number];

export const EXAM_RELEASE_MODE_LABELS: Record<ExamReleaseMode, string> = {
  auto: 'As soon as graded',
  scheduled: 'At a set date and time',
  manual: 'When I press Release',
};

// ── Limits (the same numbers as firestore.rules and the spec's §3 row 15) ───

export const EXAM_LIMITS = {
  maxQuestions: 100,
  minOptions: 2,
  maxOptions: 6,
  questionTextMax: 1000,
  optionTextMax: 300,
  titleMax: 120,
  otherLabelMax: 50,
  minDurationMinutes: 5,
  maxDurationMinutes: 300,
  minCheckpointMinutes: 5,
  maxCheckpointMinutes: 15,
  defaultCheckpointMinutes: 10,
  maxExtraMinutes: 120,
  minPoints: 0.5,
  maxPoints: 100,
  pointsStep: 0.5,
  // How long after the deadline a submit is still accepted (clock and network slack).
  submitGraceSeconds: 60,
  // Students may still read the questions this long after the window closes (extra time).
  questionsReadableAfterCloseMinutes: 120,
  // A new exam's window closes this long after its duration by default.
  defaultCloseMarginMinutes: 15,
} as const;

// ── Documents ───────────────────────────────────────────────────────────────

// institutions/{institutionId}/exams/{examId}. Every exam has the schedule fields; the online fields are present
// only when `online` is true. Readable by any signed-in user of the institution, so it holds no questions and no key.
// departmentId is required by the deployed `exams` rule's isSeniorTeacherFor() check, and teacherId by its
// per-teacher edit check — see firebase-rules.md.
export type ExamDocument = {
  institutionId: string;
  termId: string;
  termName: string;
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  teacherId: string;
  teacherName: string;
  departmentId?: string;
  date: string;
  startTime?: string;
  duration?: number; // minutes; required for an online exam
  room?: string;
  createdBy: string;
  createdByRole: string;
  createdAt: Timestamp | string;

  // Online exam fields (EXAMS_FEATURE_SPEC.md §5.1).
  title?: string;
  valueType?: ExamValueType;
  valueTypeLabel?: string; // required when valueType is 'other'
  categoryType?: ExamCategoryType;
  answerMode?: ExamAnswerMode;
  online?: boolean;
  status?: ExamStatus;
  opensAt?: Timestamp;
  closesAt?: Timestamp;
  questionCount?: number;
  totalPoints?: number;
  scoringMode?: ExamScoringMode;
  autoGrade?: boolean;
  releaseMode?: ExamReleaseMode;
  releaseAt?: Timestamp | null;
  shuffle?: boolean;
  checkpointMinutes?: number;
  keyRevision?: number;
  finalizedAt?: Timestamp;
  questionStats?: Record<string, ExamQuestionStat>;
};

// How many students answered a question and how many got it right; saved at Finalize so the difficulty table
// survives the deletion of the attempts.
export type ExamQuestionStat = { answered: number; correct: number };

export type ExamOption = { id: string; text: string };

export type ExamQuestion = {
  id: string;
  text: string;
  kind: ExamQuestionKind;
  options: ExamOption[];
  points: number;
};

// exams/{examId}/content/questions — what a student reads inside the window (no answers).
export type ExamQuestionsDocument = {
  revision: number;
  updatedAt: Timestamp;
  items: ExamQuestion[];
};

// exams/{examId}/private/key — staff only. questionId -> the correct option ids.
export type ExamKeyAnswers = Record<string, string[]>;

export type ExamKeyDocument = {
  revision: number;
  updatedAt: Timestamp;
  updatedBy: string;
  answers: ExamKeyAnswers;
};

// A student's own order: question ids, and for each question its option ids.
export type ExamOrder = {
  questions: string[];
  options: Record<string, string[]>;
};

// exams/{examId}/attempts/{studentUid}
export type ExamAttemptStatus = 'in_progress' | 'submitted';
export type ExamSubmitReason = 'student' | 'timeout' | 'expired';

export type ExamAttemptDocument = {
  institutionId: string;
  studentId: string;
  studentName: string;
  classId: string;
  status: ExamAttemptStatus;
  startedAt: Timestamp;
  deadlineAt: Timestamp;
  extraMinutes: number;
  order: ExamOrder;
  answers: Record<string, string[]>;
  flags: string[];
  tabSwitches: number;
  lastSavedAt: Timestamp;
  submittedAt?: Timestamp;
  submitReason?: ExamSubmitReason;
};

// exams/{examId}/grades/{studentUid} — the only place a student or parent reads a score, and only once
// releaseAt has passed.
export type ExamGradeDocument = {
  institutionId: string;
  studentId: string;
  studentName: string;
  classId: string;
  score: number;
  maxScore: number;
  method: 'auto' | 'manual';
  manualReason?: string;
  comment?: string;
  gradedBy: string;
  gradedByName: string;
  gradedAt: Timestamp;
  keyRevision: number;
  releaseAt: Timestamp | null;
  resultSynced: boolean;
};

// exams/{examId}/accommodations/{studentUid}
export type ExamAccommodationDocument = {
  extraMinutes: number;
  addedBy: string;
  addedAt: Timestamp;
};
