import { describe, expect, it } from 'vitest';
import { EXAM_FIXED_DOCUMENTS, EXAM_SUBCOLLECTIONS, examDeleteBlockReason, examDeleteSummary, examDeleteWarning, sittingNow } from '../examDeleteLogic';
import { chunkOperations } from '../deleteUserData';
import { examDeleteDetail } from '../teacherAudit';
import { MAX_AUDIT_DETAIL } from '../auditEntry';

// Deleting an online exam (EXAMS_FEATURE_SPEC.md §6.9): what goes with it and who is still sitting it.

const NOW = 1_000_000_000_000;
const MIN = 60_000;

describe('what hangs off an exam', () => {
  it('lists the five subcollections, two of them holding one fixed document each', () => {
    expect([...EXAM_SUBCOLLECTIONS]).toEqual(['content', 'private', 'attempts', 'grades', 'accommodations']);
    expect(EXAM_FIXED_DOCUMENTS.map((f) => `${f.collection}/${f.id}`)).toEqual(['content/questions', 'private/key']);
  });
});

describe('sittingNow', () => {
  it('counts in-progress attempts until the deadline plus the 60-second grace has passed', () => {
    const open = { status: 'in_progress', deadlineAtMs: NOW + 5 * MIN };
    const justPast = { status: 'in_progress', deadlineAtMs: NOW - 59_000 };
    const graceOver = { status: 'in_progress', deadlineAtMs: NOW - 61_000 };
    expect(sittingNow([open, justPast, graceOver], NOW)).toBe(2);
  });

  it('does not count a submitted attempt, and counts one with no stored deadline', () => {
    expect(sittingNow([{ status: 'submitted', deadlineAtMs: NOW + MIN }], NOW)).toBe(0);
    expect(sittingNow([{ status: 'in_progress' }], NOW)).toBe(1);
    expect(sittingNow([], NOW)).toBe(0);
  });
});

describe('the dialog text', () => {
  it('refuses only while students are sitting, in the singular and the plural', () => {
    expect(examDeleteBlockReason(0)).toBeNull();
    expect(examDeleteBlockReason(1)).toMatch(/^1 student is still sitting this exam/);
    expect(examDeleteBlockReason(3)).toMatch(/^3 students are still sitting this exam/);
  });

  it('lists what goes with the exam and says the results stay', () => {
    expect(examDeleteSummary({ attempts: 0, grades: 0, accommodations: 0 })).toEqual([]);
    expect(examDeleteSummary({ attempts: 1, grades: 12, accommodations: 2 })).toEqual(['1 attempt', '12 scores', '2 extra-time entries']);
    expect(examDeleteSummary({ attempts: 0, grades: 0, accommodations: 1 })).toEqual(['1 extra-time entry']);
    expect(examDeleteWarning({ attempts: 12, grades: 12, accommodations: 3 })).toBe(
      "Its questions and answer key go with it, along with 12 attempts, 12 scores, 3 extra-time entries. Scores already copied to students' results stay.",
    );
    expect(examDeleteWarning({ attempts: 0, grades: 0, accommodations: 0 })).toBe(
      "Its questions and answer key go with it. Scores already copied to students' results stay.",
    );
  });

  it('counts the picture packs and says the pictures go too, and says nothing of pictures for an exam without any', () => {
    expect(examDeleteSummary({ attempts: 0, grades: 0, accommodations: 0, imagePacks: 1 })).toEqual(['1 picture pack']);
    expect(examDeleteSummary({ attempts: 2, grades: 2, accommodations: 0, imagePacks: 3 })).toEqual(['2 attempts', '2 scores', '3 picture packs']);
    expect(examDeleteSummary({ attempts: 0, grades: 0, accommodations: 0, imagePacks: 0 })).toEqual([]);
    expect(examDeleteWarning({ attempts: 0, grades: 0, accommodations: 0, imagePacks: 2 })).toBe(
      "Its questions, pictures and answer key go with it, along with 2 picture packs. Scores already copied to students' results stay.",
    );
    expect(examDeleteWarning({ attempts: 0, grades: 0, accommodations: 0, imagePacks: 0 })).not.toContain('pictures');
  });
});

describe('the delete in batches', () => {
  it('splits a large class so each batch leaves room for the exam and its entry', () => {
    const refs = Array.from({ length: 2 + 400 + 400 + 100 }, (_, i) => i);
    const groups = chunkOperations(refs);
    expect(groups.every((g) => g.length <= 450)).toBe(true);
    expect(groups.flat()).toHaveLength(refs.length);
  });
});

describe('examDeleteDetail', () => {
  it('names the exam and counts, never a score', () => {
    const detail = examDeleteDetail({ title: 'Unit 3 Quiz', className: '5A', subjectName: 'Maths', online: true, attempts: 28, grades: 30 });
    expect(detail).toBe('Deleted online exam Unit 3 Quiz for 5A, Maths, with its questions, key, 28 attempts and 30 grades');
  });

  it('is short for an exam that was never online, and stays inside the audit limit', () => {
    expect(examDeleteDetail({ title: '', className: '5A', subjectName: 'Maths', online: false, attempts: 0, grades: 0 })).toBe('Deleted exam (untitled) for 5A, Maths');
    expect(examDeleteDetail({ title: 'x'.repeat(500), online: true, attempts: 1, grades: 1 }).length).toBeLessThanOrEqual(MAX_AUDIT_DETAIL);
  });
});
