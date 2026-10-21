import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { examRowInfo, millisOf } from '../examListLogic';

// What the Exams list shows for each exam (EXAMS_FEATURE_SPEC.md §4.7).

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const ts = (offsetMin: number) => Timestamp.fromMillis(T0 + offsetMin * MIN);
const online = (over: Record<string, unknown> = {}) => ({
  online: true,
  title: 'Unit 3 Quiz',
  subjectName: 'Maths',
  valueType: 'quiz',
  status: 'published',
  opensAt: ts(-30),
  closesAt: ts(60),
  ...over,
});

describe('millisOf', () => {
  it('reads a Timestamp and nothing else', () => {
    expect(millisOf(ts(0))).toBe(T0);
    expect(millisOf('2026-11-02')).toBeUndefined();
    expect(millisOf(null)).toBeUndefined();
    expect(millisOf(undefined)).toBeUndefined();
  });
});

describe('examRowInfo', () => {
  it('shows the title and the type, falling back to the subject for an exam with no title', () => {
    expect(examRowInfo(online(), T0, 'staff')).toMatchObject({ title: 'Unit 3 Quiz', typeLabel: 'Quiz', online: true });
    expect(examRowInfo({ subjectName: 'Maths', date: '2026-11-02' } as never, T0, 'staff')).toEqual({
      title: 'Maths',
      typeLabel: '',
      online: false,
      status: null,
    });
  });

  it('names the type for "Other"', () => {
    expect(examRowInfo(online({ valueType: 'other', valueTypeLabel: 'Spelling bee' }), T0, 'staff').typeLabel).toBe('Spelling bee');
    expect(examRowInfo(online({ valueType: 'other' }), T0, 'staff').typeLabel).toBe('Other');
    expect(examRowInfo(online({ valueType: 'end_of_term' }), T0, 'staff').typeLabel).toBe('End of term Exam');
  });

  it('gives a plain exam no status', () => {
    expect(examRowInfo({ subjectName: 'Maths', valueType: 'test' }, T0, 'staff').status).toBeNull();
    expect(examRowInfo({ subjectName: 'Maths', online: false, status: 'published' }, T0, 'student_parent').status).toBeNull();
  });

  it('shows staff the real status', () => {
    expect(examRowInfo(online({ status: 'draft' }), T0, 'staff').status).toBe('Draft');
    expect(examRowInfo(online({ opensAt: ts(10) }), T0, 'staff').status).toBe('Scheduled');
    expect(examRowInfo(online(), T0, 'staff').status).toBe('Open');
    expect(examRowInfo(online({ closesAt: ts(-1) }), T0, 'staff').status).toBe('Closed');
    expect(examRowInfo(online({ status: 'closed' }), T0, 'staff').status).toBe('Closed');
    expect(examRowInfo(online({ status: 'finalized' }), T0, 'staff').status).toBe('Finalized');
  });

  it('shows students and parents only Scheduled, Open or Closed', () => {
    const audience = 'student_parent';
    expect(examRowInfo(online({ status: 'draft' }), T0, audience).status).toBe('Scheduled');
    expect(examRowInfo(online({ opensAt: ts(10) }), T0, audience).status).toBe('Scheduled');
    expect(examRowInfo(online(), T0, audience).status).toBe('Open');
    expect(examRowInfo(online({ closesAt: ts(-1) }), T0, audience).status).toBe('Closed');
    expect(examRowInfo(online({ status: 'finalized' }), T0, audience).status).toBe('Closed');
  });
});
