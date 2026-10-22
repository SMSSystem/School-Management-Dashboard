import { describe, expect, it } from 'vitest';
import { EXAM_CLASS_QUERY_LIMIT, classIdGroups, examListClassIds } from '../examListQuery';
import hookRaw from '../../hooks/useStudentExams.ts?raw';
import pageRaw from '../../scenes/(dashboard)/list/exams/index.tsx?raw';

// What a student's or a parent's Exams list reads (EXAMS_FEATURE_SPEC.md §9): the exams of their classes only, once.

const norm = (s: string) => s.split('\r\n').join('\n');
const hook = norm(hookRaw);
const page = norm(pageRaw);

describe('examListClassIds', () => {
  it('gives a student their home class and additional classes, once each and in order', () => {
    expect(examListClassIds({ role: 'student', membership: { classId: 'b', classIds: ['c', 'a', 'b'] } })).toEqual(['a', 'b', 'c']);
    expect(examListClassIds({ role: 'student', membership: { classId: null, classIds: [] } })).toEqual([]);
  });

  it('gives a parent the classes of all their children, without repeats', () => {
    expect(
      examListClassIds({
        role: 'parent',
        children: [
          { classId: 'a', classIds: ['a'] },
          { classId: 'a', classIds: ['a', 'z'] },
          { classId: 'm', classIds: undefined },
        ],
      }),
    ).toEqual(['a', 'm', 'z']);
    expect(examListClassIds({ role: 'parent', children: [] })).toEqual([]);
  });
});

describe('classIdGroups', () => {
  it('splits the ids into groups the in filter accepts', () => {
    expect(EXAM_CLASS_QUERY_LIMIT).toBe(30);
    const ids = Array.from({ length: 65 }, (_, i) => `c${i}`);
    expect(classIdGroups(ids).map((g) => g.length)).toEqual([30, 30, 5]);
    expect(classIdGroups([])).toEqual([]);
  });
});

describe('the student and parent exam read', () => {
  it('reads once, by class, from the cache policy, with no listener and no ordering', () => {
    expect(hook).toContain('where("classId", "in", group)');
    expect(hook).toContain('staleTime: LIST_STALE_MS');
    expect(hook).not.toMatch(/onSnapshot|subscribeSnapshot|orderBy/);
  });

  it('is the only exam source for students and parents: the whole-collection listener is for staff', () => {
    expect(page).toContain('audience === "student_parent") return;');
    expect(page).toContain('<StudentExamList exams={studentSide.exams} loading={studentSide.loading} />');
  });
});
