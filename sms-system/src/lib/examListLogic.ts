import { EXAM_VALUE_TYPE_LABELS, type ExamStatus, type ExamValueType } from '@/types/exams';
import { examPhase, type ExamPhase } from './examTiming';

// What the Exams list shows for each exam: its title, type and status (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md
// §4.7). Pure and Firebase-free.

/** Staff see the real status; students and parents see only whether the exam is coming, open or over. */
export type ExamAudience = 'staff' | 'student_parent';

export type ExamRowInput = {
  title?: string;
  subjectName?: string;
  valueType?: string;
  valueTypeLabel?: string;
  online?: boolean;
  status?: string;
  opensAt?: unknown;
  closesAt?: unknown;
};

export type ExamRowInfo = {
  title: string;
  typeLabel: string;
  online: boolean;
  status: string | null;
};

/** A Firestore Timestamp (anything with toMillis) as milliseconds; undefined for anything else. */
export function millisOf(value: unknown): number | undefined {
  const toMillis = (value as { toMillis?: unknown } | null | undefined)?.toMillis;
  return typeof toMillis === 'function' ? (toMillis as () => number).call(value) : undefined;
}

const STAFF_LABELS: Record<ExamPhase, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  open: 'Open',
  closed: 'Closed',
  finalized: 'Finalized',
};

// A draft looks like an ordinary scheduled date, and a finalized exam is simply over.
const PUBLIC_LABELS: Record<ExamPhase, string> = {
  draft: 'Scheduled',
  scheduled: 'Scheduled',
  open: 'Open',
  closed: 'Closed',
  finalized: 'Closed',
};

/** The title (the subject when there is none), the type, and the status of an online exam (null for a plain one). */
export function examRowInfo(exam: ExamRowInput, nowMs: number, audience: ExamAudience): ExamRowInfo {
  const online = exam.online === true;
  const type = exam.valueType as ExamValueType | undefined;
  const typeLabel =
    type === 'other'
      ? exam.valueTypeLabel?.trim() || EXAM_VALUE_TYPE_LABELS.other
      : type && type in EXAM_VALUE_TYPE_LABELS
        ? EXAM_VALUE_TYPE_LABELS[type]
        : '';
  const phase = online
    ? examPhase(
        { status: exam.status as ExamStatus | undefined, opensAtMs: millisOf(exam.opensAt), closesAtMs: millisOf(exam.closesAt) },
        nowMs,
      )
    : null;
  return {
    title: exam.title?.trim() || exam.subjectName || '',
    typeLabel,
    online,
    status: phase ? (audience === 'staff' ? STAFF_LABELS[phase] : PUBLIC_LABELS[phase]) : null,
  };
}
