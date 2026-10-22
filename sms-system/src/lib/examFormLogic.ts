import { Timestamp } from 'firebase/firestore';
import {
  EXAM_ANSWER_MODES,
  EXAM_CATEGORY_TYPES,
  EXAM_LIMITS,
  EXAM_RELEASE_MODES,
  EXAM_SCORING_MODES,
  EXAM_VALUE_TYPES,
  type ExamAnswerMode,
  type ExamCategoryType,
  type ExamReleaseMode,
  type ExamScoringMode,
  type ExamValueType,
} from '@/types/exams';
import type { ExamIssue } from './examKeyValidation';
import { validateExamSettings, type ExamSettingsInput } from './examSettings';
import { defaultWindow } from './examTiming';

// The Add/Edit Exam form's online-exam fields (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.1): turning what
// the person typed into the settings the step-1 checks understand, mapping each problem back to its field, and
// building the fields to write. Pure and Firebase-free apart from the Timestamp class. The fields it writes are the
// ones firestore.rules' isValidOnlineExam accepts (a test keeps the two lists equal).

/** What the form holds for the new fields (all text, as the inputs give it). */
export type ExamOnlineFormValues = {
  title: string;
  valueType: string;
  valueTypeLabel: string;
  categoryType: string;
  answerMode: string;
  online: boolean;
  opensAt: string; // datetime-local
  closesAt: string; // datetime-local
  duration: string;
  scoringMode: string;
  autoGrade: boolean;
  releaseMode: string;
  releaseAt: string; // datetime-local
  shuffle: boolean;
  checkpointMinutes: string;
};

/** The starting values of the new fields. */
export function newOnlineDefaults(): ExamOnlineFormValues {
  return {
    title: '',
    valueType: '',
    valueTypeLabel: '',
    categoryType: '',
    answerMode: 'single',
    online: false,
    opensAt: '',
    closesAt: '',
    duration: '',
    scoringMode: 'all_or_nothing',
    autoGrade: false,
    releaseMode: 'manual',
    releaseAt: '',
    shuffle: true,
    checkpointMinutes: String(EXAM_LIMITS.defaultCheckpointMinutes),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Milliseconds as the value of a `datetime-local` input (the browser's time zone). */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The value of a `datetime-local` input as milliseconds; undefined when empty or not a date. */
export function fromLocalInput(text: string | undefined): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text ?? '');
  if (!m) return undefined;
  const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * The window a new online exam starts with, as input values: it opens at the exam's date and start time and
 * closes after the duration plus a margin. Null while the date or the duration is not usable yet.
 */
export function windowDefaults(
  date: string,
  startTime: string | undefined,
  durationText: string,
): { opensAt: string; closesAt: string } | null {
  const minutes = Number(durationText);
  if (!durationText || !Number.isFinite(minutes) || minutes <= 0) return null;
  const w = defaultWindow(date, startTime || undefined, minutes);
  return w ? { opensAt: toLocalInput(w.opensAtMs), closesAt: toLocalInput(w.closesAtMs) } : null;
}

const oneOf = <T extends string>(list: readonly T[], value: string): T | undefined =>
  (list as readonly string[]).includes(value) ? (value as T) : undefined;

const numberOrUndefined = (text: string): number | undefined => {
  if (text.trim() === '') return undefined;
  const n = Number(text);
  return Number.isNaN(n) ? undefined : n;
};

/** The form values as the settings the step-1 checks (validateExamSettings, publishBlockers) take. */
export function settingsFromForm(v: ExamOnlineFormValues): ExamSettingsInput {
  return {
    title: v.title,
    valueType: oneOf<ExamValueType>(EXAM_VALUE_TYPES, v.valueType),
    valueTypeLabel: v.valueTypeLabel,
    categoryType: oneOf<ExamCategoryType>(EXAM_CATEGORY_TYPES, v.categoryType),
    answerMode: oneOf<ExamAnswerMode>(EXAM_ANSWER_MODES, v.answerMode),
    durationMinutes: numberOrUndefined(v.duration),
    opensAtMs: fromLocalInput(v.opensAt),
    closesAtMs: fromLocalInput(v.closesAt),
    scoringMode: oneOf<ExamScoringMode>(EXAM_SCORING_MODES, v.scoringMode),
    autoGrade: v.autoGrade,
    releaseMode: oneOf<ExamReleaseMode>(EXAM_RELEASE_MODES, v.releaseMode),
    releaseAtMs: v.releaseMode === 'scheduled' ? (fromLocalInput(v.releaseAt) ?? null) : null,
    checkpointMinutes: numberOrUndefined(v.checkpointMinutes),
  };
}

// Which form field shows each problem the checks can report.
const FIELD_FOR_CODE: Record<string, keyof ExamOnlineFormValues> = {
  title: 'title',
  value_type: 'valueType',
  value_type_label: 'valueTypeLabel',
  category: 'categoryType',
  category_unavailable: 'categoryType',
  answer_mode: 'answerMode',
  duration: 'duration',
  window: 'opensAt',
  window_order: 'closesAt',
  window_short: 'closesAt',
  scoring_mode: 'scoringMode',
  release_mode: 'releaseMode',
  release_at: 'releaseAt',
  release_before_close: 'releaseAt',
  checkpoint: 'checkpointMinutes',
};

/** One message per form field (the first problem for it), for the form to show next to the field. */
export function issuesToFieldErrors(issues: readonly ExamIssue[]): { path: keyof ExamOnlineFormValues; message: string }[] {
  const seen = new Set<string>();
  const out: { path: keyof ExamOnlineFormValues; message: string }[] = [];
  for (const issue of issues) {
    const path = FIELD_FOR_CODE[issue.code] ?? 'title';
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, message: issue.message });
  }
  return out;
}

/** The problems with the online settings; none unless the exam is online. */
export function onlineFormErrors(v: ExamOnlineFormValues): { path: keyof ExamOnlineFormValues; message: string }[] {
  return v.online ? issuesToFieldErrors(validateExamSettings(settingsFromForm(v))) : [];
}

const timestamp = (ms: number | undefined | null) => (typeof ms === 'number' ? Timestamp.fromMillis(ms) : null);

/**
 * The fields to write for an online exam. A plain exam being turned into an online one (or a new exam) also gets
 * the starting state the rules require: a draft at key revision 1 with no questions. An exam that is already online
 * keeps its status, key revision and counts: they are not sent.
 */
export function onlineFields(
  v: ExamOnlineFormValues,
  existing: { online?: boolean } | null | undefined,
): Record<string, unknown> {
  const s = settingsFromForm(v);
  const fields: Record<string, unknown> = {
    online: true,
    title: v.title.trim(),
    valueType: v.valueType,
    ...(v.valueType === 'other' && { valueTypeLabel: v.valueTypeLabel.trim() }),
    categoryType: 'multiple_choice',
    answerMode: v.answerMode,
    opensAt: timestamp(s.opensAtMs),
    closesAt: timestamp(s.closesAtMs),
    duration: s.durationMinutes,
    scoringMode: v.scoringMode,
    autoGrade: v.autoGrade,
    releaseMode: v.releaseMode,
    releaseAt: v.releaseMode === 'scheduled' ? timestamp(s.releaseAtMs) : null,
    shuffle: v.shuffle,
    checkpointMinutes: s.checkpointMinutes,
  };
  if (existing?.online !== true) {
    fields.status = 'draft';
    fields.keyRevision = 1;
    fields.questionCount = 0;
    fields.totalPoints = 0;
  }
  return fields;
}

/** The optional labelling a schedule-only exam may carry: title, type and category, only what was filled in. */
export function plainExamLabels(v: ExamOnlineFormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (v.title.trim()) out.title = v.title.trim();
  if (v.valueType) {
    out.valueType = v.valueType;
    if (v.valueType === 'other' && v.valueTypeLabel.trim()) out.valueTypeLabel = v.valueTypeLabel.trim();
  }
  if (v.categoryType) out.categoryType = v.categoryType;
  return out;
}

/**
 * What the form may not change on an existing exam: a finalized exam is read-only, and the category and answer
 * mode lock once the exam has questions (the questions and the key depend on them).
 */
export function formLocks(existing: { status?: string; questionCount?: number } | null | undefined): {
  readOnly: boolean;
  lockCategoryAndMode: boolean;
} {
  return {
    readOnly: existing?.status === 'finalized',
    lockCategoryAndMode: (existing?.questionCount ?? 0) > 0,
  };
}

/** The form values for an exam being edited, from its stored document. */
export function onlineValuesFromExam(exam: Record<string, unknown>): ExamOnlineFormValues {
  const base = newOnlineDefaults();
  const ms = (v: unknown): number | undefined =>
    v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : undefined;
  const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
  const opens = ms(exam.opensAt);
  const closes = ms(exam.closesAt);
  const release = ms(exam.releaseAt);
  return {
    ...base,
    title: text(exam.title),
    valueType: text(exam.valueType),
    valueTypeLabel: text(exam.valueTypeLabel),
    categoryType: text(exam.categoryType),
    answerMode: text(exam.answerMode, base.answerMode),
    online: exam.online === true,
    opensAt: opens !== undefined ? toLocalInput(opens) : '',
    closesAt: closes !== undefined ? toLocalInput(closes) : '',
    duration: typeof exam.duration === 'number' ? String(exam.duration) : '',
    scoringMode: text(exam.scoringMode, base.scoringMode),
    autoGrade: exam.autoGrade === true,
    releaseMode: text(exam.releaseMode, base.releaseMode),
    releaseAt: release !== undefined ? toLocalInput(release) : '',
    shuffle: exam.shuffle !== false,
    checkpointMinutes: typeof exam.checkpointMinutes === 'number' ? String(exam.checkpointMinutes) : base.checkpointMinutes,
  };
}
