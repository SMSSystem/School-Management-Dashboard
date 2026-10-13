import { describe, expect, it } from 'vitest';
import {
  ALL,
  NONE,
  filterStudentsByClass,
  filterSubjectsByTeacher,
  filterTeachersBySubject,
  housesWithClass,
  teacherOptions,
  validChoice,
} from '../listFilters';
import { naturalCompare, sortByNameNatural } from '../sortByName';
import studentsRaw from '../../scenes/(dashboard)/list/students/index.tsx?raw';
import teachersRaw from '../../scenes/(dashboard)/list/teachers/index.tsx?raw';
import subjectsRaw from '../../scenes/(dashboard)/list/subjects/index.tsx?raw';
import housesRaw from '../../scenes/(dashboard)/list/houses/index.tsx?raw';
import classesRaw from '../../scenes/(dashboard)/list/classes/index.tsx?raw';
import lessonNotesRaw from '../../scenes/(dashboard)/list/lesson-notes/index.tsx?raw';
import selectRaw from '../../components/FilterSelect.tsx?raw';

// The dropdown filters and natural ordering on the list pages. The helpers are pure and
// tested directly; the pages are checked as source text (sort before slicing, the choice
// validated, the page reset, one shared Lesson Notes state), like the other page guards.

const norm = (s: string) => s.split('\r\n').join('\n');

describe('naturalCompare / sortByNameNatural', () => {
  it('orders numbers by value, ignores case, and puts digits before letters', () => {
    const names = ['10A', '2B', '1A', 'art', 'Biology', '3D Printing', 'Zoology'];
    expect(sortByNameNatural(names, (n) => n)).toEqual(['1A', '2B', '3D Printing', '10A', 'art', 'Biology', 'Zoology']);
    expect(naturalCompare('Class 2', 'Class 10')).toBeLessThan(0);
    expect(naturalCompare('abc', 'ABC')).toBe(0);
  });

  it('returns a new array and leaves the input alone', () => {
    const input = ['b', 'a'];
    expect(sortByNameNatural(input, (n) => n)).toEqual(['a', 'b']);
    expect(input).toEqual(['b', 'a']);
  });
});

describe('validChoice', () => {
  it('keeps All, None and a known id, and falls back to All for an id that is gone', () => {
    expect(validChoice(ALL, ['a'])).toBe(ALL);
    expect(validChoice(NONE, ['a'])).toBe(NONE);
    expect(validChoice('a', ['a', 'b'])).toBe('a');
    expect(validChoice('gone', ['a', 'b'])).toBe(ALL);
  });
});

describe('filterStudentsByClass', () => {
  const rows = [{ id: 1, classId: 'c1' }, { id: 2, classId: 'c2' }, { id: 3 }];

  it('filters by class, by no class, and passes everything for All', () => {
    expect(filterStudentsByClass(rows, ALL)).toHaveLength(3);
    expect(filterStudentsByClass(rows, 'c1').map((r) => r.id)).toEqual([1]);
    expect(filterStudentsByClass(rows, NONE).map((r) => r.id)).toEqual([3]);
    expect(filterStudentsByClass(rows, 'zzz')).toEqual([]);
  });
});

describe('teachers and subjects', () => {
  const subjects = [
    { id: 's1', name: 'Math', teacherIds: ['t1', 't2'], teacherNames: ['Ann', 'Bo'] },
    { id: 's2', name: 'Art', teacherIds: ['t2'], teacherNames: ['Bo'] },
    { id: 's3', name: 'Empty', teacherIds: [] },
    { id: 's4', name: 'Legacy' },
  ];
  const teachers = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];

  it('lists the teachers on a subject, those on none, and everyone for All', () => {
    expect(filterTeachersBySubject(teachers, subjects, ALL)).toHaveLength(3);
    expect(filterTeachersBySubject(teachers, subjects, 's1').map((t) => t.id)).toEqual(['t1', 't2']);
    expect(filterTeachersBySubject(teachers, subjects, 's2').map((t) => t.id)).toEqual(['t2']);
    expect(filterTeachersBySubject(teachers, subjects, NONE).map((t) => t.id)).toEqual(['t3']);
    expect(filterTeachersBySubject(teachers, subjects, 'gone')).toEqual([]);
  });

  it('lists the subjects of a teacher, those with no teacher (empty or missing), and all for All', () => {
    expect(filterSubjectsByTeacher(subjects, ALL)).toHaveLength(4);
    expect(filterSubjectsByTeacher(subjects, 't2').map((s) => s.id)).toEqual(['s1', 's2']);
    expect(filterSubjectsByTeacher(subjects, NONE).map((s) => s.id)).toEqual(['s3', 's4']);
  });

  it('builds the teacher options from the subjects: distinct, named, in natural order', () => {
    expect(teacherOptions(subjects)).toEqual([
      { id: 't1', name: 'Ann' },
      { id: 't2', name: 'Bo' },
    ]);
    expect(teacherOptions([{ id: 'x', teacherIds: ['u'] }])).toEqual([{ id: 'u', name: 'u' }]);
    expect(teacherOptions([])).toEqual([]);
  });
});

describe('housesWithClass', () => {
  const houses = [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }];
  const summaries = { h1: { classIds: ['c1', 'c2'] }, h2: { classIds: ['c2'] } };

  it('keeps houses with a student in the class; All keeps all; None keeps houses with no classes', () => {
    expect(housesWithClass(houses, summaries, ALL)).toHaveLength(3);
    expect(housesWithClass(houses, summaries, 'c1').map((h) => h.id)).toEqual(['h1']);
    expect(housesWithClass(houses, summaries, 'c2').map((h) => h.id)).toEqual(['h1', 'h2']);
    expect(housesWithClass(houses, summaries, NONE).map((h) => h.id)).toEqual(['h3']);
  });
});

describe('the pages', () => {
  const students = norm(studentsRaw);
  const teachers = norm(teachersRaw);
  const subjects = norm(subjectsRaw);
  const houses = norm(housesRaw);
  const classes = norm(classesRaw);
  const lessons = norm(lessonNotesRaw);

  it('Students and Teachers filter, validate and remember their choice, and reset the page', () => {
    expect(students).toContain('filterStudentsByClass(institutionFiltered, classFilter)');
    expect(students).toContain('getPersistedFilter("students", "class")');
    expect(students).toContain('setPersistedFilter("students", "class", v);');
    expect(teachers).toContain('filterTeachersBySubject(institutionFiltered, liveSubjects, subjectFilter)');
    expect(teachers).toContain('getPersistedFilter("teachers", "subject")');
    for (const page of [students, teachers]) {
      expect(page).toContain('validChoice(');
      expect(page).toMatch(/setPersistedFilter\([^)]*\);\s*setPage\(1\);/);
    }
  });

  it('Subjects, Houses and Classes sort naturally BEFORE slicing, so the order holds across pages', () => {
    for (const page of [subjects, houses, classes]) {
      expect(page).toContain('sortByNameNatural(');
      expect(page.indexOf('sortByNameNatural(')).toBeLessThan(page.indexOf('.slice((page - 1) * PAGE_SIZE'));
    }
    expect(subjects).toContain('filterSubjectsByTeacher(');
    expect(subjects).toContain('getPersistedFilter("subjects", "teacher")');
    expect(houses).toContain('housesWithClass(houses, houseSummaries, classFilter)');
    expect(houses).toContain('<Pagination total={shownHouses.length}');
    expect(houses).toContain('getPersistedFilter("houses", "class")');
  });

  it('Lesson Notes: the dropdown and the chips share one value, which is remembered', () => {
    expect(lessons).toContain('getPersistedFilter("lesson-notes", "subject")');
    expect(lessons).toContain('value={activeSubject}');
    expect(lessons).toContain('onChange={setSubject}');
    expect(lessons).toContain('onClick={() => setSubject(s)}');
    expect(lessons).toContain('.sort(naturalCompare)');
  });

  it('every dropdown is a labelled native select with an All option', () => {
    const select = norm(selectRaw);
    expect(select).toContain('aria-label={label}');
    expect(select).toContain('<option value={ALL}>{allLabel}</option>');
  });
});
