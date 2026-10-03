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

export function lessonNoteDetail(p: {
  noteName: string;
  className?: string;
  subjectName?: string;
  created: boolean;
}): string {
  const where = [clean(p.className), clean(p.subjectName)].filter(Boolean).join(', ');
  return `${p.created ? 'Created' : 'Updated'} lesson note ${named(p.noteName, '(unnamed)')}${where ? ` for ${where}` : ''}`;
}
