import { EXAM_ACTIVITY_KIND_LABELS, EXAM_LIMITS, isActivityKind, isLeaveKind, type ExamActivityEvent, type ExamIntegritySummary } from '@/types/exams';

// The words and figures of the teacher's activity report (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.4):
// how a time into the exam and a time away are written, what each timeline entry says, the line in the results table, and
// a tolerant reader of a stored summary. Pure and Firebase-free.
//
// The report says the exam page was LEFT. A browser cannot tell a new tab from a switched tab, cannot see where the
// student went, and the log is written by the student's own browser, so every screen that shows it carries the notes below.

/** What every screen that shows the log says, so nobody reads it as proof or as a verdict. */
export const ACTIVITY_NOTES = [
  'A phone call, a notification, a lost connection or a laptop update looks the same as leaving the page. Treat a Review mark as a reason to look, not as a finding.',
  'The browser cannot tell a new tab from a switched tab, and cannot see where the student went.',
  'The log is written by the student’s own browser, so an empty log is not proof that nothing happened.',
  'If the page was closed while the student was away, the time shown is the last one the app saved. It may have been longer.',
] as const;

/** Seconds since the start as the clock of the exam: 12:05, or 1:02:05 after an hour. */
export function formatOffset(seconds: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** A time away in words: "31 seconds", "4 min 10 s", "2 min", "1 h 5 min". */
export function formatAway(seconds: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  if (total < 60) return `${total} second${total === 1 ? '' : 's'}`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  return s > 0 ? `${m} min ${s} s` : `${m} min`;
}

export type TimelineLine = {
  /** Time into the exam. */
  when: string;
  what: string;
  /** For a leave: how long the page was away; empty for an act. */
  away: string;
};

/** One entry as a line of the timeline; null for a malformed entry or a kind this version does not know. */
export function describeEntry(e: ExamActivityEvent): TimelineLine | null {
  if (typeof e !== 'object' || e === null || !Number.isFinite(e.t) || !isActivityKind(e.k)) return null;
  const leave = isLeaveKind(e.k);
  const d = typeof e.d === 'number' && Number.isFinite(e.d) ? e.d : 0;
  return {
    when: formatOffset(e.t),
    what: EXAM_ACTIVITY_KIND_LABELS[e.k],
    away: leave ? (d > 0 ? formatAway(d) : 'not recorded') : '',
  };
}

/** The timeline in time order, skipping what cannot be described. */
export function describeTimeline(entries: readonly ExamActivityEvent[]): TimelineLine[] {
  return entries
    .filter((e) => describeEntry(e) !== null)
    .sort((a, b) => a.t - b.t)
    .map((e) => describeEntry(e) as TimelineLine);
}

/** The figure line of the results table: "3 leaves, 4 min 10 s away (longest 2 min)", or "No leaves". */
export function integrityCellText(s: { leaves: number; awaySeconds: number; longestAwaySeconds: number }): string {
  if (s.leaves <= 0) return 'No leaves';
  const leaves = `${s.leaves} leave${s.leaves === 1 ? '' : 's'}`;
  if (s.awaySeconds <= 0) return leaves;
  const longest = s.leaves > 1 && s.longestAwaySeconds > 0 ? ` (longest ${formatAway(s.longestAwaySeconds)})` : '';
  return `${leaves}, ${formatAway(s.awaySeconds)} away${longest}`;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/**
 * A summary read back from a grade, or null when it is not one. Tolerant of what is inside the timeline (entries this
 * version cannot read are kept out of it) and of a missing optional field, strict about the figures.
 */
export function integrityFrom(data: unknown): ExamIntegritySummary | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (!isCount(d.leaves) || !isCount(d.hiddenLeaves) || !isCount(d.awaySeconds) || !isCount(d.longestAwaySeconds) || !isCount(d.acts)) return null;
  if (typeof d.review !== 'boolean' || !Array.isArray(d.timeline)) return null;
  const timeline = (d.timeline as ExamActivityEvent[])
    .filter((e) => typeof e === 'object' && e !== null && Number.isFinite(e.t) && typeof e.k === 'string')
    .slice(0, EXAM_LIMITS.maxTimelineEntries);
  return {
    leaves: d.leaves,
    hiddenLeaves: d.hiddenLeaves,
    awaySeconds: d.awaySeconds,
    longestAwaySeconds: d.longestAwaySeconds,
    acts: d.acts,
    ...(isCount(d.fastAnswers) && { fastAnswers: d.fastAnswers }),
    review: d.review,
    timeline,
  };
}
