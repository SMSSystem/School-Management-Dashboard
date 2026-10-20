import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RoleFields } from '../../components/forms/createUser/RoleFields';
import { StudentFields } from '../../components/forms/createUser/StudentFields';
import { TeacherFields } from '../../components/forms/createUser/TeacherFields';

// What each field group of the Create Account form shows for a role and a set of lookups. The built
// form's HTML was compared before and after the split for every role; these cover the variants that
// screen cannot reach read-only (a locked role, a preset institution) and keep them from drifting.

// The extra-classes picker reads subjects from Firestore; its own behaviour is tested elsewhere.
vi.mock('../../components/forms/ExtraClassesField', () => ({ default: () => createElement('div', { id: 'extra-classes' }) }));

// A stand-in for react-hook-form's register(): the field name is all the markup needs.
const register = ((name: string) => ({ name, onChange: async () => {}, onBlur: async () => {}, ref: () => {} })) as never;
const errors = {} as never;

const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

const roleProps = {
  register,
  errors,
  role: 'super_admin' as const,
  roleOptions: ['student', 'parent', 'spectator'] as never,
  selectedRole: 'student' as const,
  requiresInstitution: true,
  institutionName: 'Example School',
  institutions: [
    { id: 'i1', name: 'Example School' },
    { id: 'i2', name: 'Hawthorn' },
  ],
};
const role = (over: Record<string, unknown>) => html(createElement(RoleFields, { ...roleProps, ...over }));

describe('RoleFields', () => {
  it('offers the role as a dropdown, in the order given', () => {
    const out = role({});
    expect(out).toContain('<select id="tour-create-user-role"');
    expect(out.indexOf('>Student</option>')).toBeLessThan(out.indexOf('>Parent</option>'));
    expect(out.indexOf('>Parent</option>')).toBeLessThan(out.indexOf('>Spectator</option>'));
  });

  it('shows a locked role as a disabled, read-only box with its label and no dropdown', () => {
    const out = role({ lockedRole: 'institution_admin' });
    expect(out).not.toContain('<select id="tour-create-user-role"');
    expect(out).toMatch(/<input id="tour-create-user-role"[^>]*value="Admin"/);
    expect(out).toMatch(/<input id="tour-create-user-role"[^>]*disabled/);
    expect(out).toMatch(/<input id="tour-create-user-role"[^>]*readOnly=""/);
  });

  it('explains the spectator role, and only for a spectator', () => {
    expect(role({ selectedRole: 'spectator' })).toContain('A spectator can view everything an administrator can');
    expect(role({ selectedRole: 'student' })).not.toContain('A spectator can view');
  });

  it('lets a super admin pick the institution from the list', () => {
    const out = role({});
    expect(out).toContain('<select id="tour-create-user-institution"');
    expect(out).toContain('<option value="">Select institution</option>');
    expect(out).toContain('<option value="i2">Hawthorn</option>');
  });

  it("shows an institution admin their own institution's name, disabled", () => {
    const out = role({ role: 'institution_admin' });
    expect(out).not.toContain('<select id="tour-create-user-institution"');
    expect(out).toMatch(/<input id="tour-create-user-institution"[^>]*value="Example School"/);
    expect(out).toMatch(/<input id="tour-create-user-institution"[^>]*disabled/);
  });

  it('shows no institution field for a super admin account or when the institution is preset', () => {
    expect(role({ requiresInstitution: false })).not.toContain('tour-create-user-institution');
    expect(role({ initialInstitutionId: 'i1' })).not.toContain('tour-create-user-institution');
  });
});

const classes = [
  { id: 'c1', name: 'Grade 7A' },
  { id: 'c2', name: 'Grade 7B' },
] as never;
const departments = [{ id: 'd1', name: 'Science' }];
const teacher = (over: Record<string, unknown>) =>
  html(createElement(TeacherFields, { register, errors, selectedRole: 'senior_teacher', departments, classes, ...over } as never));

describe('TeacherFields', () => {
  it('gives a senior teacher department, homeroom class, room and building', () => {
    const out = teacher({});
    for (const id of ['department', 'assigned-class', 'homeroom-room', 'homeroom-building']) expect(out, id).toContain(`id="tour-create-user-${id}"`);
    expect(out).toContain('<option value="c2">Grade 7B</option>');
    expect(out).toContain('<option value="d1">Science</option>');
  });

  it('gives a regular teacher only the department', () => {
    const out = teacher({ selectedRole: 'regular_teacher' });
    expect(out).toContain('id="tour-create-user-department"');
    expect(out).not.toContain('tour-create-user-assigned-class');
    expect(out).not.toContain('tour-create-user-homeroom');
  });

  it('shows no department when the institution has none, and no homeroom without classes', () => {
    expect(teacher({ departments: [] })).not.toContain('tour-create-user-department');
    expect(teacher({ classes: [] })).not.toContain('tour-create-user-assigned-class');
    expect(teacher({ classes: [] })).not.toContain('tour-create-user-homeroom');
  });

  it('shows nothing for any other role', () => {
    for (const selectedRole of ['student', 'parent', 'spectator', 'institution_admin']) expect(teacher({ selectedRole })).toBe('');
  });
});

const student = (over: Record<string, unknown>) =>
  html(
    createElement(StudentFields, {
      register,
      errors,
      selectedRole: 'student',
      classes,
      institutionIdValue: 'i1',
      homeClassIdValue: '',
      extras: { extraClassIds: [], classSubjects: {} },
      onExtrasChange: () => {},
      ...over,
    } as never),
  );

describe('StudentFields', () => {
  it('gives a student a class, additional classes, date of birth, student ID and gender', () => {
    const out = student({});
    for (const id of ['class', 'dob', 'student-id', 'gender']) expect(out, id).toContain(`id="tour-create-user-${id}"`);
    expect(out).toContain('id="extra-classes"');
    expect(out).toContain('<option value="">Select gender</option>');
  });

  it('leaves out the class pickers when the institution has no classes or none is chosen yet', () => {
    const none = student({ classes: [] });
    expect(none).not.toContain('tour-create-user-class');
    expect(none).not.toContain('extra-classes');
    expect(none).toContain('tour-create-user-dob');
    expect(student({ institutionIdValue: '' })).not.toContain('extra-classes');
  });

  it('shows nothing for any other role', () => {
    for (const selectedRole of ['senior_teacher', 'regular_teacher', 'parent', 'spectator']) expect(student({ selectedRole })).toBe('');
  });
});
