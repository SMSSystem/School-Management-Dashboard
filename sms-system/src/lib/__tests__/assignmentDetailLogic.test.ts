import { describe, expect, it } from 'vitest';
import {
  STATUS_BADGE_CLS,
  STATUS_LABEL,
  assignmentGradebookId,
  assignmentTypeLabel,
  buildRoster,
  canEditAssignment,
  canViewRoster,
  conversionColumnsOf,
  formatDueDate,
  gradeToSave,
  gradingFormFor,
  validateGrade,
} from '../assignmentDetailLogic';

// The assignment detail page's rules that need no screen or database. Written when they were moved out of the
// page, so the move is pinned to what the page did.

describe('who may edit and who may see the roster', () => {
  it('lets the admins and the two teacher roles edit, grade and convert, and nobody else', () => {
    for (const role of ['institution_admin', 'super_admin', 'regular_teacher', 'senior_teacher']) {
      expect(canEditAssignment(role), role).toBe(true);
    }
    for (const role of ['spectator', 'student', 'parent', null]) {
      expect(canEditAssignment(role), String(role)).toBe(false);
    }
  });

  it('lets a spectator see the roster and submissions but not change them', () => {
    expect(canViewRoster('spectator')).toBe(true);
    expect(canViewRoster('regular_teacher')).toBe(true);
    expect(canViewRoster('institution_admin')).toBe(true);
    expect(canViewRoster('student')).toBe(false);
    expect(canViewRoster('parent')).toBe(false);
    expect(canEditAssignment('spectator')).toBe(false);
  });
});

describe('submission status text', () => {
  it('has a label and a colour for each of the three statuses', () => {
    expect(STATUS_LABEL).toEqual({ submitted: 'Submitted', late: 'Late', graded: 'Graded' });
    expect(Object.keys(STATUS_BADGE_CLS)).toEqual(['submitted', 'late', 'graded']);
  });
});

describe('assignmentGradebookId', () => {
  it('joins class, subject and term', () => {
    expect(assignmentGradebookId({ classId: 'c1', subjectId: 's1', termId: 't1' })).toBe('c1_s1_t1');
  });
});

describe('assignmentTypeLabel', () => {
  it('uses the type’s label, the typed label for "other", and a dash for a legacy assignment with no type', () => {
    expect(assignmentTypeLabel({ type: 'other', otherTypeLabel: 'Field trip' })).toBe('Field trip');
    expect(assignmentTypeLabel({ type: 'other' })).toBe('Other');
    expect(assignmentTypeLabel({ type: undefined as never })).toBe('—');
    expect(assignmentTypeLabel({ type: 'homework' as never })).not.toBe('—');
  });
});

describe('formatDueDate', () => {
  it('writes the month in full, and a dash when there is no date', () => {
    expect(formatDueDate('2026-10-05')).toBe('October 5, 2026');
    expect(formatDueDate('2026-12-31')).toBe('December 31, 2026');
    expect(formatDueDate(undefined)).toBe('—');
    expect(formatDueDate('')).toBe('—');
  });
});

describe('buildRoster', () => {
  const doc = (id: string, data: Record<string, unknown>) => ({ id, data });

  it('lists the class’s students by name, with their ids, and leaves out students in other classes', () => {
    const roster = buildRoster(
      [
        doc('s2', { name: 'Bo', classId: 'c1', classIds: ['c1'], institutionStudentId: 'S-2' }),
        doc('s1', { name: 'Ada', classId: 'c1', classIds: ['c1'], institutionStudentId: 'S-1' }),
        doc('s3', { name: 'Cy', classId: 'c9', classIds: ['c9'] }),
      ],
      'c1',
      'math',
    );
    expect(roster).toEqual([
      { uid: 's1', name: 'Ada', institutionStudentId: 'S-1' },
      { uid: 's2', name: 'Bo', institutionStudentId: 'S-2' },
    ]);
  });

  it('leaves out a student whose extra-class subjects do not include this subject, and falls back to the id for a missing name', () => {
    const roster = buildRoster(
      [
        doc('s1', { classId: 'c0', classIds: ['c0', 'c1'], classSubjects: { c1: ['art'] } }),
        doc('s2', { classId: 'c0', classIds: ['c0', 'c1'], classSubjects: { c1: ['math'] } }),
        doc('s3', { classId: 'c0', classIds: ['c0', 'c1'] }), // no list for the extra class: takes every subject
      ],
      'c1',
      'math',
    );
    expect(roster.map((r) => r.uid)).toEqual(['s2', 's3']);
    expect(roster.map((r) => r.name)).toEqual(['s2', 's3']);
  });
});

describe('gradingFormFor', () => {
  it('starts empty for an ungraded submission, and with the saved grade, maximum and feedback for a graded one', () => {
    expect(gradingFormFor(undefined, 'standalone', null)).toEqual({ score: '', maxScore: '', feedback: '', picks: {} });
    expect(gradingFormFor({ grade: 7, maxGrade: 10, feedback: 'Good' } as never, 'standalone', null)).toEqual({
      score: '7',
      maxScore: '10',
      feedback: 'Good',
      picks: {},
    });
    expect(gradingFormFor({ grade: 0, maxGrade: 5 } as never, 'standalone', null).score).toBe('0');
  });

  it('takes the maximum from the linked gradebook column in gradebook mode, whatever the submission says', () => {
    expect(gradingFormFor({ grade: 7, maxGrade: 10 } as never, 'gradebook', 50).maxScore).toBe('50');
    expect(gradingFormFor(undefined, 'gradebook', null).maxScore).toBe('');
  });

  it('starts a re-grade from the saved rubric scores, dropping any for criteria no longer in the grid', () => {
    const criteria = [{ id: 'c1', name: 'Content', maxPoints: 4, levels: [{ label: 'Good', points: 4 }] }];
    const saved = { grade: 4, maxGrade: 4, rubricScores: [{ criterionId: 'c1', points: 4, level: 'Good' }, { criterionId: 'gone', points: 1 }] };
    expect(gradingFormFor(saved as never, 'standalone', null, criteria).picks).toEqual({ c1: { points: 4, level: 'Good' } });
  });
});

describe('gradeToSave', () => {
  const criteria = [
    { id: 'c1', name: 'Content', maxPoints: 4, levels: [{ label: 'Good', points: 4 }] },
    { id: 'c2', name: 'Style', maxPoints: 6, levels: [] },
  ];

  it('saves a plain grade when the rubric is not used', () => {
    expect(gradeToSave('7', '10', criteria, {})).toEqual({ score: 7, maxScore: 10, rubricScoring: null });
    expect(gradeToSave('7', '10', [], {})).toEqual({ score: 7, maxScore: 10, rubricScoring: null });
  });

  it('refuses a part-scored rubric, naming what is left', () => {
    expect(gradeToSave('4', '10', criteria, { c1: { points: 4, level: 'Good' } })).toEqual({
      error: 'Score every rubric criterion, or clear the rubric scores. Still to score: Style.',
    });
  });

  it('saves the scores, total and max with a fully scored rubric, even when the score was changed', () => {
    const picks = { c1: { points: 4, level: 'Good' }, c2: { points: 4.5 } };
    expect(gradeToSave('9', '10', criteria, picks)).toEqual({
      score: 9,
      maxScore: 10,
      rubricScoring: {
        scores: [{ criterionId: 'c1', points: 4, level: 'Good' }, { criterionId: 'c2', points: 4.5 }],
        total: 8.5,
        max: 10,
      },
    });
  });

  it('still runs the score checks', () => {
    const picks = { c1: { points: 4, level: 'Good' }, c2: { points: 6 } };
    expect(gradeToSave('11', '10', criteria, picks)).toEqual({ error: 'Score cannot exceed the max score.' });
  });
});

describe('validateGrade', () => {
  it('accepts a score within the maximum, including zero and equal to it', () => {
    expect(validateGrade('7', '10')).toEqual({ score: 7, maxScore: 10 });
    expect(validateGrade('0', '10')).toEqual({ score: 0, maxScore: 10 });
    expect(validateGrade('10', '10')).toEqual({ score: 10, maxScore: 10 });
  });

  it('asks for valid numbers, and a maximum above zero', () => {
    const message = 'Enter a valid score and max score.';
    expect(validateGrade('abc', '10')).toEqual({ error: message });
    expect(validateGrade('5', '')).toEqual({ error: message }); // an empty box reads as 0
    expect(validateGrade('5', '0')).toEqual({ error: message });
    expect(validateGrade('5', '-3')).toEqual({ error: message });
  });

  it('does not allow a score above the maximum', () => {
    expect(validateGrade('11', '10')).toEqual({ error: 'Score cannot exceed the max score.' });
  });
});

describe('conversionColumnsOf', () => {
  it('lists the columns in order with defaults for a missing label, maximum or order', () => {
    expect(
      conversionColumnsOf([
        { id: 'b', data: { label: 'Quiz', maxScore: 20, order: 2 } },
        { id: 'a', data: { label: 'Test', maxScore: 50, order: 1 } },
        { id: 'c', data: {} },
      ]),
    ).toEqual([
      { id: 'c', label: 'Untitled column', maxScore: 0, order: 0 },
      { id: 'a', label: 'Test', maxScore: 50, order: 1 },
      { id: 'b', label: 'Quiz', maxScore: 20, order: 2 },
    ]);
  });
});
