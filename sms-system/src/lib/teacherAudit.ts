// The `detail` text of the teacher audit events (attendance_edit, results_edit,
// comment_edit, lesson_note_edit). Each names WHAT was saved (class, subject,
// date, term) and a count, never a score, a comment or a list of students: audit
// entries are permanent, so values would persist personal data forever.
// Pure so the wording and its 300-character budget are unit-tested.

const clean = (s: string | null | undefined) => (s ?? '').trim();

// "Class 3A", or a neutral word when the name is not known (names come from
// cached lists and can be briefly missing).
const named = (value: string | null | undefined, fallback: string) => clean(value) || fallback;

export function generalAttendanceDetail(p: {
  className: string;
  dateISO: string;
  session: string;
  recorded: number;
}): string {
  return `Saved general attendance for ${named(p.className, 'a class')}, ${p.dateISO} ${p.session} (${p.recorded} student${p.recorded === 1 ? '' : 's'} recorded)`;
}

// One summary for a "Save All": it saves several registers at once.
export function generalAttendanceAllDetail(p: {
  className: string;
  sessions: { dateISO: string; session: string }[];
}): string {
  const n = p.sessions.length;
  const list = p.sessions.map((s) => `${s.dateISO} ${s.session}`).join(', ');
  return `Saved ${n} general attendance register${n === 1 ? '' : 's'} for ${named(p.className, 'a class')}: ${list}`;
}

export function subjectAttendanceDetail(p: {
  className: string;
  subjectName: string;
  dateISO: string;
  recorded: number;
}): string {
  return `Saved subject attendance for ${named(p.className, 'a class')}, ${named(p.subjectName, 'a subject')}, ${p.dateISO} (${p.recorded} student${p.recorded === 1 ? '' : 's'} recorded)`;
}

export function gradebookSaveDetail(p: {
  className: string;
  subjectName: string;
  termName: string;
  scoresChanged: number;
  columnsEdited: number;
}): string {
  const parts = [
    p.scoresChanged > 0 ? `${p.scoresChanged} score${p.scoresChanged === 1 ? '' : 's'}` : '',
    p.columnsEdited > 0 ? `${p.columnsEdited} column${p.columnsEdited === 1 ? '' : 's'} edited` : '',
  ].filter(Boolean);
  return `Saved gradebook for ${named(p.className, 'a class')}, ${named(p.subjectName, 'a subject')}, ${named(p.termName, 'a term')} (${parts.join(', ')})`;
}

export function gradebookColumnDeleteDetail(p: {
  className: string;
  subjectName: string;
  termName: string;
  columnLabel: string;
  resultsDeleted: number;
}): string {
  return `Deleted gradebook column ${named(p.columnLabel, '(unnamed)')} and ${p.resultsDeleted} result${p.resultsDeleted === 1 ? '' : 's'} for ${named(p.className, 'a class')}, ${named(p.subjectName, 'a subject')}, ${named(p.termName, 'a term')}`;
}

// Conduct grades and comments saved from the gradebook, for a number of students.
export function gradebookCommentsDetail(p: {
  className: string;
  subjectName: string;
  termName: string;
  students: number;
}): string {
  return `Saved feedback comments for ${p.students} student${p.students === 1 ? '' : 's'}, ${named(p.className, 'a class')}, ${named(p.subjectName, 'a subject')}, ${named(p.termName, 'a term')}`;
}

export function feedbackCommentDetail(p: { studentName: string; subjectName: string; termName?: string }): string {
  const term = clean(p.termName) ? `, ${clean(p.termName)}` : '';
  return `Saved feedback comment for ${named(p.studentName, 'a student')}, ${named(p.subjectName, 'a subject')}${term}`;
}

export function resultDetail(p: {
  studentName: string;
  subjectName: string;
  assessmentName: string;
  created: boolean;
}): string {
  return `${p.created ? 'Added' : 'Updated'} result ${named(p.assessmentName, '(unnamed)')} for ${named(p.studentName, 'a student')}, ${named(p.subjectName, 'a subject')}`;
}

// A lesson note can be for several classes and several subjects: the first three of each are named and the rest
// counted, so the line stays inside the rules' 300-character limit (which also cuts a very long note name).
const LESSON_NOTE_NAMED = 3;
const DETAIL_LIMIT = 300;

function namedList(names: (string | null | undefined)[], noun: string): string {
  const list = names.map(clean).filter(Boolean);
  const more = list.length - LESSON_NOTE_NAMED;
  return list.slice(0, LESSON_NOTE_NAMED).join(', ') + (more > 0 ? ` and ${more} more ${noun}${more === 1 ? '' : noun === 'class' ? 'es' : 's'}` : '');
}

export function lessonNoteDetail(p: {
  noteName: string;
  className?: string;
  classNames?: string[];
  subjectName?: string;
  subjectNames?: string[];
  created: boolean;
}): string {
  const classes = namedList(p.classNames?.length ? p.classNames : [p.className], 'class');
  const subjects = namedList(p.subjectNames?.length ? p.subjectNames : [p.subjectName], 'subject');
  const where = [classes, subjects].filter(Boolean).join(', ');
  return `${p.created ? 'Created' : 'Updated'} lesson note ${named(p.noteName, '(unnamed)')}${where ? ` for ${where}` : ''}`.slice(
    0,
    DETAIL_LIMIT,
  );
}

// The `exam_edit` entry of an online exam being created or saved. It names the exam, class and subject, never a
// question, an answer or a score.
export function examEditDetail(p: { title: string; className?: string; subjectName?: string; created: boolean }): string {
  const where = [clean(p.className), clean(p.subjectName)].filter(Boolean).join(', ');
  return `${p.created ? 'Created' : 'Updated'} online exam ${named(p.title, '(untitled)')}${where ? ` for ${where}` : ''}`.slice(0, 300);
}

// The `exam_edit` entry of the builder saving an online exam's questions, or only correcting its answer key.
// Counts only: never question text, an option or the key.
export function examContentDetail(p: {
  title: string;
  className?: string;
  subjectName?: string;
  questionCount: number;
  totalPoints: number;
  keyOnly: boolean;
}): string {
  const where = [clean(p.className), clean(p.subjectName)].filter(Boolean).join(', ');
  const what = p.keyOnly
    ? `Corrected the answer key of online exam ${named(p.title, '(untitled)')}`
    : `Saved ${p.questionCount} question${p.questionCount === 1 ? '' : 's'} (${p.totalPoints} point${p.totalPoints === 1 ? '' : 's'}) in online exam ${named(p.title, '(untitled)')}`;
  return `${what}${where ? ` for ${where}` : ''}`.slice(0, 300);
}

export type ExamStatusAction = 'published' | 'draft' | 'closed' | 'reopened';

const STATUS_PHRASES: Record<ExamStatusAction, string> = {
  published: 'Published',
  draft: 'Returned to draft',
  closed: 'Closed early',
  reopened: 'Reopened',
};

// The `exam_publish` entry of a status change. `window` is the opening and closing time, already written out.
export function examStatusDetail(p: {
  action: ExamStatusAction;
  title: string;
  className?: string;
  subjectName?: string;
  window?: string;
}): string {
  const where = [clean(p.className), clean(p.subjectName)].filter(Boolean).join(', ');
  return `${STATUS_PHRASES[p.action]} online exam ${named(p.title, '(untitled)')}${where ? ` for ${where}` : ''}${clean(p.window) ? ` (${clean(p.window)})` : ''}`.slice(0, 300);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const onlineExamFor = (p: { title: string; className?: string; subjectName?: string }) => {
  const where = [clean(p.className), clean(p.subjectName)].filter(Boolean).join(', ');
  return `online exam ${named(p.title, '(untitled)')}${where ? ` for ${where}` : ''}`;
};

// The `exam_grade` entry: a grading run (counts), a score entered or overridden, or one student re-graded. It names the
// student for a single change and never says the score.
export function examGradeDetail(
  p: { title: string; className?: string; subjectName?: string } & (
    | { kind: 'run'; graded: number; expired: number; regraded: number }
    | { kind: 'manual' | 'override' | 'regrade'; studentName: string }
  ),
): string {
  const exam = onlineExamFor(p);
  let what: string;
  if (p.kind === 'run') {
    const parts = [`Graded ${plural(p.graded, 'attempt')}`];
    if (p.regraded > 0) parts.push(`${p.regraded} of them re-graded after a key change`);
    if (p.expired > 0) parts.push(`marked ${plural(p.expired, 'unfinished attempt')} expired`);
    what = parts.join(', ');
  } else {
    const verb = p.kind === 'manual' ? 'Entered a score for' : p.kind === 'override' ? 'Overrode the score of' : 'Re-graded';
    what = `${verb} ${named(p.studentName, 'a student')}`;
  }
  return `${what} in ${exam}`.slice(0, 300);
}

// The `exam_release` entry: scores released, or released scores copied into the results.
export function examReleaseDetail(p: { title: string; className?: string; subjectName?: string; released: number; synced: number }): string {
  const parts: string[] = [];
  if (p.released > 0) parts.push(`Released ${plural(p.released, 'score')}`);
  if (p.synced > 0) parts.push(`${p.released > 0 ? 'copied' : 'Copied'} ${plural(p.synced, 'score')} to the results`);
  return `${parts.join(' and ') || 'Released scores'} in ${onlineExamFor(p)}`.slice(0, 300);
}

// The `exam_finalize` entry: how many attempts were removed and how many scores were kept.
export function examFinalizeDetail(p: { title: string; className?: string; subjectName?: string; attemptsRemoved: number; grades: number }): string {
  return `Finalized ${onlineExamFor(p)}: removed ${plural(p.attemptsRemoved, 'attempt')}, kept ${plural(p.grades, 'grade')}`.slice(0, 300);
}

// The `exam_edit` entry of an administrator deleting an exam. Counts of what went with it, never a score or an answer;
// an exam that was never online has none.
export function examDeleteDetail(p: { title: string; className?: string; subjectName?: string; online: boolean; attempts: number; grades: number }): string {
  const where = [clean(p.className), clean(p.subjectName)].filter(Boolean).join(', ');
  const what = p.online ? 'online exam' : 'exam';
  const with_ = p.online ? `, with its questions, key, ${plural(p.attempts, 'attempt')} and ${plural(p.grades, 'grade')}` : '';
  return `Deleted ${what} ${named(p.title, '(untitled)')}${where ? ` for ${where}` : ''}${with_}`.slice(0, 300);
}

// The `exam_edit` entry of giving one student extra time. The minutes, not a score.
export function examExtraTimeDetail(p: { title: string; className?: string; subjectName?: string; studentName: string; extraMinutes: number }): string {
  return `Gave ${named(p.studentName, 'a student')} ${plural(p.extraMinutes, 'minute')} of extra time in ${onlineExamFor(p)}`.slice(0, 300);
}
