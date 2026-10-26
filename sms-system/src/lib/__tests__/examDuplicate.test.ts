import { describe, expect, it } from 'vitest';
import { canDuplicate, copiedContent, duplicateDefaults } from '../examDuplicate';
import { onlineValuesFromExam } from '../examFormLogic';
import type { ExamQuestion } from '@/types/exams';

// Duplicating an online exam (EXAMS_FEATURE_SPEC.md §4.7).

const source = {
  id: 'exam1',
  title: 'Unit 3 Quiz',
  termId: 't1',
  termName: 'Term 1',
  subjectId: 's1',
  subjectName: 'Maths',
  classId: 'c1',
  className: '3A',
  teacherId: 'u1',
  teacherName: 'Ms Lee',
  departmentId: 'd1',
  date: '2026-10-22',
  startTime: '09:00',
  duration: 45,
  room: 'R2',
  valueType: 'quiz',
  categoryType: 'multiple_choice',
  answerMode: 'both',
  online: true,
  status: 'published',
  opensAt: { toMillis: () => 1 },
  closesAt: { toMillis: () => 2 },
  questionCount: 4,
  totalPoints: 8,
  scoringMode: 'partial',
  autoGrade: true,
  releaseMode: 'scheduled',
  releaseAt: { toMillis: () => 3 },
  shuffle: false,
  checkpointMinutes: 15,
  keyRevision: 3,
  finalizedAt: { toMillis: () => 4 },
  questionStats: { q1: { answered: 1, correct: 1 } },
};

describe('duplicateDefaults', () => {
  const out = duplicateDefaults(source);

  it('names the exam it is copied from and starts as an online exam titled "Copy of …"', () => {
    expect(out.duplicateOf).toBe('exam1');
    expect(out.online).toBe(true);
    expect(out.title).toBe('Copy of Unit 3 Quiz');
  });

  it('copies what the exam is about and how it is set up', () => {
    expect(out).toMatchObject({
      termId: 't1',
      subjectId: 's1',
      classId: 'c1',
      teacherId: 'u1',
      startTime: '09:00',
      room: 'R2',
      duration: 45,
      valueType: 'quiz',
      categoryType: 'multiple_choice',
      answerMode: 'both',
      scoringMode: 'partial',
      autoGrade: true,
      releaseMode: 'scheduled',
      shuffle: false,
      checkpointMinutes: 15,
    });
  });

  it('leaves out the date, the window, the release time, the status and everything counted or saved', () => {
    expect(out.date).toBe('');
    for (const field of ['opensAt', 'closesAt', 'releaseAt', 'status', 'questionCount', 'totalPoints', 'keyRevision', 'finalizedAt', 'questionStats', 'createdBy', 'id']) {
      expect(out).not.toHaveProperty(field);
    }
  });

  it('gives the form blank windows to fill in from the new date', () => {
    const values = onlineValuesFromExam(out);
    expect(values.opensAt).toBe('');
    expect(values.closesAt).toBe('');
    expect(values.title).toBe('Copy of Unit 3 Quiz');
    expect(values.online).toBe(true);
  });

  it('keeps the title inside 120 characters and copes with a missing title', () => {
    expect(String(duplicateDefaults({ ...source, title: 'x'.repeat(200) }).title)).toHaveLength(120);
    expect(duplicateDefaults({ ...source, title: undefined }).title).toBe('Copy of exam');
  });
});

describe('canDuplicate', () => {
  it('is true only for an online exam', () => {
    expect(canDuplicate({ online: true })).toBe(true);
    expect(canDuplicate({ online: false })).toBe(false);
    expect(canDuplicate({})).toBe(false);
  });
});

describe('copiedContent and the pictures', () => {
  it('keeps each question’s reference to its picture, as a copy of the object', () => {
    const image = { id: 'i1', pack: 2, w: 10, h: 10, bytes: 100, exact: true, alt: 'A vice' };
    const q = { id: 'q1', text: 'T', kind: 'single' as const, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], points: 1, image };
    const plain = { id: 'q2', text: 'T', kind: 'single' as const, options: q.options, points: 1 };
    const out = copiedContent([q, plain], { q1: ['a'] });
    expect(out.questions[0].image).toEqual(image);
    expect(out.questions[0].image).not.toBe(image);
    expect('image' in out.questions[1]).toBe(false);
  });
});

describe('copiedContent', () => {
  const questions: ExamQuestion[] = [
    { id: 'a', text: 'A?', kind: 'single', options: [{ id: 'a1', text: 'x' }, { id: 'a2', text: 'y' }], points: 1 },
    { id: 'b', text: 'B?', kind: 'multiple', options: [{ id: 'b1', text: 'x' }, { id: 'b2', text: 'y' }], points: 2.5 },
  ];

  it('copies the questions and key with the counts for the new exam', () => {
    const out = copiedContent(questions, { a: ['a1'], b: ['b1', 'b2'] });
    expect(out.questions).toEqual(questions);
    expect(out.answers).toEqual({ a: ['a1'], b: ['b1', 'b2'] });
    expect(out.questionCount).toBe(2);
    expect(out.totalPoints).toBe(3.5);
  });

  it('drops a key entry for a question that is not there and copes with no key', () => {
    expect(copiedContent(questions, { a: ['a1'], gone: ['z'] }).answers).toEqual({ a: ['a1'] });
    expect(copiedContent(questions, undefined).answers).toEqual({});
  });

  it('shares nothing with the source', () => {
    const out = copiedContent(questions, { a: ['a1'] });
    out.questions[0].options[0].text = 'changed';
    out.answers.a.push('a2');
    expect(questions[0].options[0].text).toBe('x');
  });
});
