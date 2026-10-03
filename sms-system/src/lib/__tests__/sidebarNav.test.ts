import { describe, expect, it } from 'vitest';
import {
  findActiveSectionTitle,
  groupNeedsAttention,
  isGroupCollapsible,
  isItemActive,
  menuSections,
  STUDENT_TEMPORARILY_HIDDEN,
  visibleItems,
  type MenuSection,
} from '../sidebarNav';

const labelsOf = (title: string) =>
  menuSections.find((s) => s.title === title)?.items.map((i) => i.label);

const itemOf = (label: string) =>
  menuSections.flatMap((s) => s.items).find((i) => i.label === label);

const sectionOf = (title: string): MenuSection =>
  menuSections.find((s) => s.title === title)!;

const visibleLabels = (role: string | null, title: string) =>
  visibleItems(sectionOf(title), role).map((i) => i.label);

describe('sidebar membership', () => {
  it('keeps the group order', () => {
    expect(menuSections.map((s) => s.title)).toEqual([
      '',
      'PEOPLE',
      'CURRICULUM',
      'TIMETABLE',
      'OUTCOMES',
      'REPORTS',
      'ATTENDANCE',
      'ADMINISTRATION',
      'OTHER',
    ]);
  });

  it('puts the right items in each group, in order', () => {
    expect(labelsOf('')).toEqual(['Home']);
    expect(labelsOf('PEOPLE')).toEqual(['Create Account', 'Teachers', 'Students', 'Parents']);
    expect(labelsOf('CURRICULUM')).toEqual(['Subjects', 'Departments', 'Houses', 'Classes']);
    expect(labelsOf('TIMETABLE')).toEqual([
      'Terms',
      'Schedule',
      'Lessons',
      'Exams',
      'Assignments',
      'Rubrics',
    ]);
    expect(labelsOf('OUTCOMES')).toEqual([
      'Gradebook',
      'Results',
      'Feedback',
      'Disciplinary Action',
      'Grade Tracking',
    ]);
    expect(labelsOf('REPORTS')).toEqual([
      'Report Card Comments',
      'Report Cards',
      'Progress Reports',
      'Report Builder',
    ]);
    expect(labelsOf('ATTENDANCE')).toEqual([
      'General Register',
      'Summary Register',
      'Subject Register',
      'My Attendance',
      'Child Attendance',
    ]);
    expect(labelsOf('ADMINISTRATION')).toEqual([
      'Registrations',
      'Academic Calendar',
      'Backfill Classes',
      'Import Data',
      'Rebuild Summaries',
      'Audit Log',
    ]);
    expect(labelsOf('OTHER')).toEqual([
      'User Profile',
      'Brand Settings',
      'Institution Profile',
      'Institution Info',
    ]);
  });

  it('lists every item once, with no duplicate labels', () => {
    const labels = menuSections.flatMap((s) => s.items.map((i) => i.label));
    expect(labels).toHaveLength(39);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('relocated items keep their href, visibility and id', () => {
  const ADMINS = ['super_admin', 'institution_admin'];
  const expected: [string, string, string[], string | undefined][] = [
    ['Registrations', '/dashboard/registrations', ADMINS, 'tour-sidebar-nav-registrations'],
    ['Report Card Comments', '/dashboard/report-card-comments', ['institution_admin'], 'tour-sidebar-nav-report-card-comments'],
    [
      'Report Cards',
      '/dashboard/report-cards',
      ['super_admin', 'institution_admin', 'senior_teacher', 'regular_teacher', 'student', 'parent'],
      'tour-sidebar-nav-report-cards',
    ],
    [
      'Progress Reports',
      '/dashboard/progress-reports',
      ['super_admin', 'institution_admin', 'senior_teacher', 'regular_teacher', 'student', 'parent'],
      'tour-sidebar-nav-progress-reports',
    ],
    ['Report Builder', '/dashboard/reports/builder', [...ADMINS, 'senior_teacher'], 'tour-sidebar-nav-report-builder'],
    ['Import Data', '/dashboard/import', [...ADMINS, 'senior_teacher', 'regular_teacher'], 'tour-sidebar-nav-import'],
    ['Academic Calendar', '/dashboard/academic-calendar', ['institution_admin'], 'tour-sidebar-nav-academic-calendar'],
    ['Backfill Classes', '/dashboard/admin/backfill-student-classes', ADMINS, 'tour-sidebar-nav-backfill-classes'],
    ['Rebuild Summaries', '/dashboard/admin/rebuild-attendance-summaries', ['institution_admin'], 'tour-sidebar-nav-rebuild-summaries'],
    ['Audit Log', '/dashboard/admin/audit-log', ADMINS, undefined],
  ];

  it.each(expected)('%s', (label, href, visible, id) => {
    const item = itemOf(label);
    expect(item?.href).toBe(href);
    expect(item?.visible).toEqual(visible);
    expect(item?.id).toBe(id);
  });
});

describe('role visibility after the regroup', () => {
  it('hides the temporary student items, so a student has no REPORTS group', () => {
    for (const label of STUDENT_TEMPORARILY_HIDDEN) {
      const group = menuSections.find((s) => s.items.some((i) => i.label === label))!;
      expect(visibleLabels('student', group.title)).not.toContain(label);
    }
    expect(visibleLabels('student', 'REPORTS')).toEqual([]);
    expect(visibleLabels('student', 'ATTENDANCE')).toEqual(['My Attendance']);
  });

  it('gives a teacher only Import Data under ADMINISTRATION', () => {
    expect(visibleLabels('senior_teacher', 'ADMINISTRATION')).toEqual(['Import Data']);
    expect(visibleLabels('regular_teacher', 'ADMINISTRATION')).toEqual(['Import Data']);
  });

  it('gives an institution_admin all six ADMINISTRATION items', () => {
    expect(visibleLabels('institution_admin', 'ADMINISTRATION')).toHaveLength(6);
  });

  it('splits a parent’s reports from outcomes', () => {
    expect(visibleLabels('parent', 'OUTCOMES')).toEqual(['Results', 'Disciplinary Action']);
    expect(visibleLabels('parent', 'REPORTS')).toEqual(['Report Cards', 'Progress Reports']);
  });

  it('shows an unknown or missing role nothing', () => {
    for (const s of menuSections) {
      expect(visibleLabels(null, s.title)).toEqual([]);
      expect(visibleLabels('visitor', s.title)).toEqual([]);
    }
  });
});

describe('what each role sees per group', () => {
  const TITLES = ['PEOPLE', 'CURRICULUM', 'TIMETABLE', 'OUTCOMES', 'REPORTS', 'ATTENDANCE', 'ADMINISTRATION', 'OTHER'];
  const table: Record<string, Record<string, string[]>> = {
    super_admin: {
      PEOPLE: ['Create Account', 'Teachers', 'Students', 'Parents'],
      CURRICULUM: ['Subjects', 'Departments', 'Classes'],
      TIMETABLE: ['Terms', 'Schedule', 'Exams', 'Assignments', 'Rubrics'],
      OUTCOMES: ['Gradebook', 'Results', 'Feedback', 'Disciplinary Action', 'Grade Tracking'],
      REPORTS: ['Report Cards', 'Progress Reports', 'Report Builder'],
      ATTENDANCE: ['General Register', 'Summary Register', 'Subject Register'],
      ADMINISTRATION: ['Registrations', 'Backfill Classes', 'Import Data', 'Audit Log'],
      OTHER: ['User Profile', 'Brand Settings'],
    },
    institution_admin: {
      PEOPLE: ['Create Account', 'Teachers', 'Students', 'Parents'],
      CURRICULUM: ['Subjects', 'Departments', 'Houses', 'Classes'],
      TIMETABLE: ['Terms', 'Schedule', 'Lessons', 'Exams', 'Assignments', 'Rubrics'],
      OUTCOMES: ['Gradebook', 'Results', 'Feedback', 'Disciplinary Action', 'Grade Tracking'],
      REPORTS: ['Report Card Comments', 'Report Cards', 'Progress Reports', 'Report Builder'],
      ATTENDANCE: ['General Register', 'Summary Register', 'Subject Register'],
      ADMINISTRATION: ['Registrations', 'Academic Calendar', 'Backfill Classes', 'Import Data', 'Rebuild Summaries', 'Audit Log'],
      OTHER: ['User Profile', 'Institution Profile'],
    },
    senior_teacher: {
      PEOPLE: ['Teachers', 'Students', 'Parents'],
      CURRICULUM: ['Classes'],
      TIMETABLE: ['Schedule', 'Lessons', 'Exams', 'Assignments', 'Rubrics'],
      OUTCOMES: ['Gradebook', 'Results', 'Feedback', 'Disciplinary Action'],
      REPORTS: ['Report Cards', 'Progress Reports', 'Report Builder'],
      ATTENDANCE: ['General Register', 'Summary Register'],
      ADMINISTRATION: ['Import Data'],
      OTHER: ['User Profile', 'Institution Info'],
    },
    regular_teacher: {
      PEOPLE: ['Teachers', 'Students', 'Parents'],
      CURRICULUM: ['Classes'],
      TIMETABLE: ['Schedule', 'Lessons', 'Exams', 'Assignments', 'Rubrics'],
      OUTCOMES: ['Gradebook', 'Results', 'Feedback', 'Disciplinary Action'],
      REPORTS: ['Report Cards', 'Progress Reports'],
      ATTENDANCE: ['Subject Register'],
      ADMINISTRATION: ['Import Data'],
      OTHER: ['User Profile', 'Institution Info'],
    },
    student: {
      PEOPLE: [],
      CURRICULUM: [],
      TIMETABLE: ['Schedule', 'Lessons', 'Assignments'],
      OUTCOMES: ['Results'],
      REPORTS: [],
      ATTENDANCE: ['My Attendance'],
      ADMINISTRATION: [],
      OTHER: ['User Profile', 'Institution Info'],
    },
    parent: {
      PEOPLE: [],
      CURRICULUM: [],
      TIMETABLE: ['Schedule', 'Lessons', 'Exams', 'Assignments'],
      OUTCOMES: ['Results', 'Disciplinary Action'],
      REPORTS: ['Report Cards', 'Progress Reports'],
      ATTENDANCE: ['Child Attendance'],
      ADMINISTRATION: [],
      OTHER: ['User Profile', 'Institution Info'],
    },
  };

  it.each(Object.keys(table))('%s', (role) => {
    for (const title of TITLES) {
      expect(visibleLabels(role, title), `${role} / ${title}`).toEqual(table[role][title]);
    }
    expect(visibleLabels(role, '')).toEqual(['Home']);
  });
});

describe('isItemActive', () => {
  it('matches /dashboard exactly', () => {
    expect(isItemActive('/dashboard', '/dashboard')).toBe(true);
    expect(isItemActive('/dashboard', '/dashboard/list/students')).toBe(false);
  });

  it('matches a child route by path segment', () => {
    expect(isItemActive('/dashboard/list/assignments', '/dashboard/list/assignments/abc')).toBe(true);
  });

  it('does not match a mere string prefix', () => {
    expect(isItemActive('/dashboard/list/students', '/dashboard/list/students-archive')).toBe(false);
  });

  it('tolerates a trailing slash', () => {
    expect(isItemActive('/dashboard/list/students', '/dashboard/list/students/')).toBe(true);
  });
});

describe('isGroupCollapsible', () => {
  it('is true for a group with two or more visible items', () => {
    expect(isGroupCollapsible(sectionOf('PEOPLE'), 'institution_admin')).toBe(true);
    expect(isGroupCollapsible(sectionOf('ADMINISTRATION'), 'institution_admin')).toBe(true);
  });

  it('is false for a one-item group', () => {
    expect(isGroupCollapsible(sectionOf('ADMINISTRATION'), 'regular_teacher')).toBe(false);
    expect(isGroupCollapsible(sectionOf('ATTENDANCE'), 'regular_teacher')).toBe(false);
    expect(isGroupCollapsible(sectionOf('OUTCOMES'), 'student')).toBe(false);
    expect(isGroupCollapsible(sectionOf('ATTENDANCE'), 'parent')).toBe(false);
  });

  it('is false for the untitled Home section and for a role that sees none', () => {
    expect(isGroupCollapsible(sectionOf(''), 'institution_admin')).toBe(false);
    expect(isGroupCollapsible(sectionOf('REPORTS'), 'student')).toBe(false);
  });
});

describe('groupNeedsAttention', () => {
  const flagged = new Set(['Institution Profile']);

  it('flags OTHER for a role that sees Institution Profile', () => {
    expect(groupNeedsAttention(sectionOf('OTHER'), 'institution_admin', flagged)).toBe(true);
  });

  it('does not flag a role that sees Institution Info instead', () => {
    expect(groupNeedsAttention(sectionOf('OTHER'), 'senior_teacher', flagged)).toBe(false);
  });

  it('is false with an empty set, or for another group', () => {
    expect(groupNeedsAttention(sectionOf('OTHER'), 'institution_admin', new Set())).toBe(false);
    expect(groupNeedsAttention(sectionOf('PEOPLE'), 'institution_admin', flagged)).toBe(false);
  });
});

describe('findActiveSectionTitle', () => {
  it.each([
    ['/dashboard/create-user', 'PEOPLE'],
    ['/dashboard/list/subjects', 'CURRICULUM'],
    ['/dashboard/list/terms', 'TIMETABLE'],
    ['/dashboard/list/results', 'OUTCOMES'],
    ['/dashboard/report-cards', 'REPORTS'],
    ['/dashboard/attendance/general', 'ATTENDANCE'],
    ['/dashboard/admin/audit-log', 'ADMINISTRATION'],
    ['/dashboard/profile', 'OTHER'],
  ])('%s is in %s', (path, title) => {
    expect(findActiveSectionTitle(path, 'institution_admin')).toBe(title);
  });

  it('returns null for Home', () => {
    expect(findActiveSectionTitle('/dashboard', 'institution_admin')).toBeNull();
  });

  it('returns null for a student on a hidden item URL', () => {
    expect(findActiveSectionTitle('/dashboard/list/exams', 'student')).toBeNull();
  });

  it('returns the list group for a detail route', () => {
    expect(findActiveSectionTitle('/dashboard/list/classes/abc', 'institution_admin')).toBe('CURRICULUM');
  });

  it('returns null with no role', () => {
    expect(findActiveSectionTitle('/dashboard/profile', null)).toBeNull();
  });
});
