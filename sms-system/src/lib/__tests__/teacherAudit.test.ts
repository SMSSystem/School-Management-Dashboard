import { describe, expect, it } from 'vitest';
import { MAX_AUDIT_DETAIL, MAX_BATCH_OPERATIONS, fitsInBatch, staffFallback } from '../auditEntry';
import {
  feedbackCommentDetail,
  generalAttendanceAllDetail,
  generalAttendanceDetail,
  gradebookColumnDeleteDetail,
  gradebookCommentsDetail,
  gradebookSaveDetail,
  lessonNoteDetail,
  examContentDetail,
  examEditDetail,
  examFinalizeDetail,
  examGradeDetail,
  examReleaseDetail,
  examStatusDetail,
  resultDetail,
  subjectAttendanceDetail,
} from '../teacherAudit';

describe('teacher audit details', () => {
  it('describes a general attendance register by class, date, session and count', () => {
    expect(generalAttendanceDetail({ className: 'Class 3A', dateISO: '2026-10-02', session: 'AM', recorded: 24 })).toBe(
      'Saved general attendance for Class 3A, 2026-10-02 AM (24 students recorded)',
    );
    expect(generalAttendanceDetail({ className: 'Class 3A', dateISO: '2026-10-02', session: 'PM', recorded: 1 })).toContain(
      '(1 student recorded)',
    );
  });

  it('summarises a Save All in one entry', () => {
    const detail = generalAttendanceAllDetail({
      className: 'Class 3A',
      sessions: [
        { dateISO: '2026-10-01', session: 'AM' },
        { dateISO: '2026-10-01', session: 'PM' },
      ],
    });
    expect(detail).toBe('Saved 2 general attendance registers for Class 3A: 2026-10-01 AM, 2026-10-01 PM');
    expect(generalAttendanceAllDetail({ className: 'X', sessions: [{ dateISO: '2026-10-01', session: 'AM' }] })).toContain(
      'Saved 1 general attendance register for',
    );
  });

  it('describes a subject attendance register', () => {
    expect(
      subjectAttendanceDetail({ className: 'Class 3A', subjectName: 'Maths', dateISO: '2026-10-02', recorded: 20 }),
    ).toBe('Saved subject attendance for Class 3A, Maths, 2026-10-02 (20 students recorded)');
  });

  it('describes a gradebook save by what changed, with counts only', () => {
    expect(
      gradebookSaveDetail({ className: 'Class 3A', subjectName: 'Maths', termName: 'Term 1', scoresChanged: 12, columnsEdited: 2 }),
    ).toBe('Saved gradebook for Class 3A, Maths, Term 1 (12 scores, 2 columns edited)');
    expect(
      gradebookSaveDetail({ className: 'Class 3A', subjectName: 'Maths', termName: 'Term 1', scoresChanged: 1, columnsEdited: 0 }),
    ).toContain('(1 score)');
    expect(
      gradebookSaveDetail({ className: 'Class 3A', subjectName: 'Maths', termName: 'Term 1', scoresChanged: 0, columnsEdited: 1 }),
    ).toContain('(1 column edited)');
  });

  it('describes a column deletion and the results it removed', () => {
    expect(
      gradebookColumnDeleteDetail({
        className: 'Class 3A', subjectName: 'Maths', termName: 'Term 1', columnLabel: 'Quiz 1', resultsDeleted: 24,
      }),
    ).toBe('Deleted gradebook column Quiz 1 and 24 results for Class 3A, Maths, Term 1');
  });

  it('describes comments saved from the gradebook, a feedback comment, a result and a lesson note', () => {
    expect(gradebookCommentsDetail({ className: 'C', subjectName: 'S', termName: 'T', students: 3 })).toBe(
      'Saved feedback comments for 3 students, C, S, T',
    );
    expect(feedbackCommentDetail({ studentName: 'Ann Lee', subjectName: 'Maths', termName: 'Term 1' })).toBe(
      'Saved feedback comment for Ann Lee, Maths, Term 1',
    );
    expect(resultDetail({ studentName: 'Ann Lee', subjectName: 'Maths', assessmentName: 'Quiz 1', created: true })).toBe(
      'Added result Quiz 1 for Ann Lee, Maths',
    );
    expect(resultDetail({ studentName: 'Ann Lee', subjectName: 'Maths', assessmentName: 'Quiz 1', created: false })).toContain(
      'Updated result',
    );
    expect(lessonNoteDetail({ noteName: 'Fractions', className: 'Class 3A', subjectName: 'Maths', created: true })).toBe(
      'Created lesson note Fractions for Class 3A, Maths',
    );
    expect(lessonNoteDetail({ noteName: 'Fractions', created: false })).toBe('Updated lesson note Fractions');
  });

  it('names the first three classes of a lesson note and counts the rest', () => {
    const note = { noteName: 'Fractions', subjectName: 'Maths', created: true };
    expect(lessonNoteDetail({ ...note, classNames: ['3A', '3B'] })).toBe('Created lesson note Fractions for 3A, 3B, Maths');
    expect(lessonNoteDetail({ ...note, classNames: ['3A', '3B', '3C', '4A'] })).toBe(
      'Created lesson note Fractions for 3A, 3B, 3C and 1 more class, Maths',
    );
    expect(lessonNoteDetail({ ...note, classNames: ['A', 'B', 'C', 'D', 'E'] })).toContain('and 2 more classes');
    // The list wins over the single name.
    expect(lessonNoteDetail({ ...note, className: '3A', classNames: ['3B'] })).toContain('for 3B, Maths');
  });

  it('names the first three subjects of a lesson note and counts the rest', () => {
    const note = { noteName: 'Fractions', classNames: ['3A'], created: false };
    expect(lessonNoteDetail({ ...note, subjectNames: ['Maths', 'Science'] })).toBe('Updated lesson note Fractions for 3A, Maths, Science');
    expect(lessonNoteDetail({ ...note, subjectNames: ['A', 'B', 'C', 'D'] })).toBe('Updated lesson note Fractions for 3A, A, B, C and 1 more subject');
    expect(lessonNoteDetail({ ...note, subjectNames: ['A', 'B', 'C', 'D', 'E'] })).toContain('and 2 more subjects');
    // The list wins over the single name.
    expect(lessonNoteDetail({ ...note, subjectName: 'Old', subjectNames: ['New'] })).toContain('3A, New');
  });

  it('keeps a lesson note with the most classes within the rules\' 300-character detail limit', () => {
    const long = 'x'.repeat(100);
    const detail = lessonNoteDetail({
      noteName: 'n'.repeat(150),
      classNames: Array.from({ length: 20 }, () => long),
      subjectNames: [long, long, long, long, long],
      created: true,
    });
    expect(detail.length).toBeLessThanOrEqual(300);
  });

  it('falls back to neutral words when a name is missing', () => {
    expect(generalAttendanceDetail({ className: '', dateISO: '2026-10-02', session: 'AM', recorded: 0 })).toContain('a class');
    expect(feedbackCommentDetail({ studentName: '  ', subjectName: '' })).toBe('Saved feedback comment for a student, a subject');
  });

  it('never includes scores, comments or student lists: details carry names and counts only', () => {
    const all = [
      gradebookSaveDetail({ className: 'C', subjectName: 'S', termName: 'T', scoresChanged: 5, columnsEdited: 0 }),
      gradebookCommentsDetail({ className: 'C', subjectName: 'S', termName: 'T', students: 5 }),
    ].join(' ');
    expect(all).not.toMatch(/\d+\s*\/\s*\d+|score of|grade of/i);
  });

  it('keeps a Save All of a full week within the rules\' 300-character detail limit', () => {
    // 5 days x 2 sessions, a long class name: the longest realistic Save All.
    const sessions = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].flatMap((d) => [
      { dateISO: d, session: 'AM' },
      { dateISO: d, session: 'PM' },
    ]);
    const detail = generalAttendanceAllDetail({ className: 'Class 10 Science Stream A', sessions });
    expect(detail.length).toBeLessThanOrEqual(MAX_AUDIT_DETAIL);
  });
});

describe('batch limit', () => {
  it('fits an audit entry until the batch is one operation from the cap', () => {
    expect(fitsInBatch(0)).toBe(true);
    expect(fitsInBatch(MAX_BATCH_OPERATIONS - 1)).toBe(true);
    expect(fitsInBatch(MAX_BATCH_OPERATIONS)).toBe(false);
  });

  it('accounts for several entries at once', () => {
    expect(fitsInBatch(MAX_BATCH_OPERATIONS - 2, 2)).toBe(true);
    expect(fitsInBatch(MAX_BATCH_OPERATIONS - 1, 2)).toBe(false);
  });
});

describe('staffFallback', () => {
  it('calls admins Administrator and teachers Teacher', () => {
    expect(staffFallback('institution_admin')).toBe('Administrator');
    expect(staffFallback('super_admin')).toBe('Administrator');
    expect(staffFallback('regular_teacher')).toBe('Teacher');
    expect(staffFallback('senior_teacher')).toBe('Teacher');
    expect(staffFallback(null)).toBe('Teacher');
  });
});

describe('examEditDetail', () => {
  it('names the exam, class and subject and whether it was created or updated', () => {
    expect(examEditDetail({ title: 'Unit 3 Quiz', className: '3A', subjectName: 'Maths', created: true })).toBe(
      'Created online exam Unit 3 Quiz for 3A, Maths',
    );
    expect(examEditDetail({ title: 'Unit 3 Quiz', created: false })).toBe('Updated online exam Unit 3 Quiz');
    expect(examEditDetail({ title: '  ', created: true })).toBe('Created online exam (untitled)');
  });

  it('stays within the rules’ 300-character limit', () => {
    expect(examEditDetail({ title: 'x'.repeat(120), className: 'c'.repeat(100), subjectName: 's'.repeat(100), created: true }).length).toBeLessThanOrEqual(300);
  });
});

describe('examContentDetail', () => {
  it('counts the questions and points saved and names the exam, class and subject', () => {
    expect(
      examContentDetail({ title: 'Unit 3 Quiz', className: '3A', subjectName: 'Maths', questionCount: 12, totalPoints: 15.5, keyOnly: false }),
    ).toBe('Saved 12 questions (15.5 points) in online exam Unit 3 Quiz for 3A, Maths');
    expect(examContentDetail({ title: 'Q', questionCount: 1, totalPoints: 1, keyOnly: false })).toBe(
      'Saved 1 question (1 point) in online exam Q',
    );
  });

  it('says a key correction is a correction, without naming any answer', () => {
    expect(examContentDetail({ title: 'Unit 3 Quiz', className: '3A', questionCount: 12, totalPoints: 15, keyOnly: true })).toBe(
      'Corrected the answer key of online exam Unit 3 Quiz for 3A',
    );
  });

  it('stays within the rules’ 300-character limit', () => {
    expect(examContentDetail({ title: 'x'.repeat(120), className: 'c'.repeat(150), subjectName: 's'.repeat(150), questionCount: 100, totalPoints: 100, keyOnly: false }).length).toBeLessThanOrEqual(300);
  });
});

describe('examStatusDetail', () => {
  it('describes each change of status with the window', () => {
    const base = { title: 'Unit 3 Quiz', className: '3A', subjectName: 'Maths', window: '2026-10-22 09:00 to 2026-10-22 10:00' };
    expect(examStatusDetail({ ...base, action: 'published' })).toBe(
      'Published online exam Unit 3 Quiz for 3A, Maths (2026-10-22 09:00 to 2026-10-22 10:00)',
    );
    expect(examStatusDetail({ title: 'Quiz', action: 'draft' })).toBe('Returned to draft online exam Quiz');
    expect(examStatusDetail({ title: 'Quiz', action: 'closed' })).toBe('Closed early online exam Quiz');
    expect(examStatusDetail({ title: ' ', action: 'reopened' })).toBe('Reopened online exam (untitled)');
  });

  it('stays within the rules’ 300-character limit', () => {
    expect(examStatusDetail({ action: 'published', title: 'x'.repeat(120), className: 'c'.repeat(150), subjectName: 's'.repeat(150), window: 'w'.repeat(60) }).length).toBeLessThanOrEqual(300);
  });
});

describe('examGradeDetail', () => {
  const exam = { title: 'Unit 3 Quiz', className: '3A', subjectName: 'Maths' };

  it('counts what a grading run did, without any score', () => {
    expect(examGradeDetail({ ...exam, kind: 'run', graded: 28, expired: 0, regraded: 0 })).toBe(
      'Graded 28 attempts in online exam Unit 3 Quiz for 3A, Maths',
    );
    expect(examGradeDetail({ ...exam, kind: 'run', graded: 1, expired: 2, regraded: 1 })).toBe(
      'Graded 1 attempt, 1 of them re-graded after a key change, marked 2 unfinished attempts expired in online exam Unit 3 Quiz for 3A, Maths',
    );
  });

  it('names the student for a single change and never the score', () => {
    expect(examGradeDetail({ ...exam, kind: 'override', studentName: 'Ann Lee' })).toBe(
      'Overrode the score of Ann Lee in online exam Unit 3 Quiz for 3A, Maths',
    );
    expect(examGradeDetail({ ...exam, kind: 'manual', studentName: 'Ann Lee' })).toContain('Entered a score for Ann Lee');
    expect(examGradeDetail({ ...exam, kind: 'regrade', studentName: '' })).toContain('Re-graded a student');
  });

  it('stays within the rules’ 300-character limit', () => {
    expect(examGradeDetail({ title: 'x'.repeat(120), className: 'c'.repeat(100), subjectName: 's'.repeat(100), kind: 'override', studentName: 'n'.repeat(200) }).length).toBeLessThanOrEqual(300);
  });
});

describe('examReleaseDetail', () => {
  it('says how many scores were released and how many were copied to the results', () => {
    expect(examReleaseDetail({ title: 'Quiz', released: 28, synced: 28 })).toBe('Released 28 scores and copied 28 scores to the results in online exam Quiz');
    expect(examReleaseDetail({ title: 'Quiz', released: 0, synced: 1 })).toBe('Copied 1 score to the results in online exam Quiz');
    expect(examReleaseDetail({ title: 'Quiz', released: 1, synced: 0, className: '3A' })).toBe('Released 1 score in online exam Quiz for 3A');
  });
});

describe('examFinalizeDetail', () => {
  it('counts the attempts removed and the grades kept', () => {
    expect(examFinalizeDetail({ title: 'Quiz', className: '3A', attemptsRemoved: 30, grades: 31 })).toBe(
      'Finalized online exam Quiz for 3A: removed 30 attempts, kept 31 grades',
    );
    expect(examFinalizeDetail({ title: 'Quiz', attemptsRemoved: 1, grades: 1 })).toBe('Finalized online exam Quiz: removed 1 attempt, kept 1 grade');
  });
});

