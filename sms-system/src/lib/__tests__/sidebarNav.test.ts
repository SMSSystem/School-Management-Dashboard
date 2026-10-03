import { describe, expect, it } from 'vitest';
import { menuSections, STUDENT_TEMPORARILY_HIDDEN } from '../sidebarNav';

const labelsOf = (title: string) =>
  menuSections.find((s) => s.title === title)?.items.map((i) => i.label);

const itemOf = (label: string) =>
  menuSections.flatMap((s) => s.items).find((i) => i.label === label);

// What a role sees in a group, applying the same filter Menu.tsx renders with.
const visibleLabels = (role: string | null, title: string) =>
  (menuSections.find((s) => s.title === title)?.items ?? [])
    .filter(
      (i) =>
        role !== null &&
        i.visible.includes(role) &&
        !(role === 'student' && STUDENT_TEMPORARILY_HIDDEN.has(i.label)),
    )
    .map((i) => i.label);

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
