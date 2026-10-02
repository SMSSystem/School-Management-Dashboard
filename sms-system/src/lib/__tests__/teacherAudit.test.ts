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
