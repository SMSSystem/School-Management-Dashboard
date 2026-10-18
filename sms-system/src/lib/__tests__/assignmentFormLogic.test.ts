import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  buildAssignmentPayload,
  classOptionsFor,
  gradebookIdFor,
  initialAttachment,
  resolveTeacher,
  schema,
  teacherOptionsFor,
  type AssignmentFormOutput,
} from '../assignmentFormLogic';

// The assignment form's rules that need no screen or database. Written when they were moved out of the form,
// so the move is pinned to what the form did.

const valid = {
  title: 'Fractions quiz',
  type: 'homework',
  otherTypeLabel: '',
  status: 'draft',
  termId: 't1',
  subjectId: 's1',
  classId: 'c1',
  teacherId: 'u1',
  dueDate: '2026-10-30',
  description: '',
  gradingMode: 'standalone',
  gradebookColumnId: '',
  rubricId: '',
};

const issues = (over: Record<string, unknown>) => {
  const result = schema.safeParse({ ...valid, ...over });
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('the assignment form schema', () => {
  it('accepts a complete assignment', () => {
    expect(issues({})).toEqual([]);
  });

  it('asks for a title of up to 150 characters', () => {
    expect(issues({ title: '' })).toEqual(['title: Title is required.']);
    expect(issues({ title: 'x'.repeat(150) })).toEqual([]);
    expect(issues({ title: 'x'.repeat(151) })).toEqual(['title: Title must be 150 characters or less.']);
  });

  it('asks for a term, subject, class, teacher and due date', () => {
    expect(issues({ termId: '' })).toEqual(['termId: Term is required.']);
    expect(issues({ subjectId: '' })).toEqual(['subjectId: Subject is required.']);
    expect(issues({ classId: '' })).toEqual(['classId: Class is required.']);
    expect(issues({ teacherId: '' })).toEqual(['teacherId: Teacher is required.']);
    expect(issues({ dueDate: '' })).toEqual(['dueDate: Due date is required.']);
  });

  it('wants a label when the type is Other, and limits it to 100 characters', () => {
    expect(issues({ type: 'other', otherTypeLabel: '  ' })).toEqual(['otherTypeLabel: Required when type is "Other".']);
    expect(issues({ type: 'other', otherTypeLabel: 'Field trip' })).toEqual([]);
    expect(issues({ otherTypeLabel: 'x'.repeat(101) })).toEqual(['otherTypeLabel: Must be 100 characters or less.']);
  });

  it('wants a gradebook column when the grading mode is gradebook', () => {
    expect(issues({ gradingMode: 'gradebook', gradebookColumnId: '' })).toEqual(['gradebookColumnId: Select a gradebook column.']);
    expect(issues({ gradingMode: 'gradebook', gradebookColumnId: 'col1' })).toEqual([]);
  });

  it('limits the description to 2000 characters and rejects an unknown type or status', () => {
    expect(issues({ description: 'x'.repeat(2001) })).toEqual(['description: Description must be 2000 characters or less.']);
    expect(issues({ type: 'nonsense' })).toHaveLength(1);
    expect(issues({ status: 'archived' })).toHaveLength(1);
  });
});

describe('initialAttachment', () => {
  it('is null when the assignment has no attachment', () => {
    expect(initialAttachment(undefined)).toBeNull();
    expect(initialAttachment({ title: 'x' })).toBeNull();
  });

  it('is the embedded file, with its name, type and size', () => {
    expect(
      initialAttachment({ attachmentDataUrl: 'data:application/pdf;base64,AAAA', attachmentFileName: 'a.pdf', attachmentMimeType: 'application/pdf', attachmentSize: 1234 }),
    ).toEqual({ dataUrl: 'data:application/pdf;base64,AAAA', fileName: 'a.pdf', mimeType: 'application/pdf', size: 1234 });
  });

  it('is only the key for a large file stored elsewhere, and defaults the missing details', () => {
    expect(initialAttachment({ attachmentBlobKey: 'k1' })).toEqual({ dataUrl: '', blobKey: 'k1', fileName: 'attachment', mimeType: 'application/pdf', size: 0 });
    expect(initialAttachment({ attachmentBlobKey: 'k1', attachmentDataUrl: 'data:x' })?.dataUrl).toBe('');
  });
});

describe('gradebookIdFor', () => {
  it('joins class, subject and term, and is null until all three are chosen', () => {
    expect(gradebookIdFor('c1', 's1', 't1')).toBe('c1_s1_t1');
    expect(gradebookIdFor('', 's1', 't1')).toBeNull();
    expect(gradebookIdFor('c1', '', 't1')).toBeNull();
    expect(gradebookIdFor('c1', 's1', '')).toBeNull();
  });
});

describe('classOptionsFor and teacherOptionsFor', () => {
  const classes = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
  const subject = { classScope: 'class', classIds: ['c1', 'c3'], teacherIds: ['u1', 'u2'], teacherNames: ['Ms One'] };

  it('offers every class with no subject, for an institution-wide subject and for one with no class list', () => {
    expect(classOptionsFor(undefined, classes)).toBe(classes);
    expect(classOptionsFor({ ...subject, classScope: 'institution' }, classes)).toBe(classes);
    expect(classOptionsFor({ ...subject, classIds: [] }, classes)).toBe(classes);
  });

  it('offers only the subject’s classes otherwise', () => {
    expect(classOptionsFor(subject, classes).map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('lists the subject’s teachers, using the id when a name is missing, and none without a subject', () => {
    expect(teacherOptionsFor(subject)).toEqual([{ id: 'u1', name: 'Ms One' }, { id: 'u2', name: 'u2' }]);
    expect(teacherOptionsFor(undefined)).toEqual([]);
  });
});

describe('resolveTeacher', () => {
  const base = {
    isTeacherRole: false,
    role: 'institution_admin',
    lockedTeacherId: 'me',
    lockedTeacherName: 'My Name',
    formTeacherId: 'u1',
    teacherOptions: [{ id: 'u1', name: 'Ms One' }],
    teacherMetaById: { u1: { departmentId: 'd1', role: 'regular_teacher' as const } },
    userUid: 'me',
    myDepartmentId: 'dMine',
    type: 'create' as const,
    data: undefined,
  };

  it('uses the signed-in teacher as the author, with their own department and role', () => {
    expect(resolveTeacher({ ...base, isTeacherRole: true, role: 'senior_teacher' })).toEqual({
      teacherId: 'me',
      teacherName: 'My Name',
      departmentId: 'dMine',
      teacherRole: 'senior_teacher',
    });
  });

  it('uses the teacher an admin picked, with the department and role from the teachers’ list', () => {
    expect(resolveTeacher(base)).toEqual({ teacherId: 'u1', teacherName: 'Ms One', departmentId: 'd1', teacherRole: 'regular_teacher' });
  });

  it('has no role for a teacher the list does not know on create, so the form refuses to save', () => {
    expect(resolveTeacher({ ...base, formTeacherId: 'u9' }).teacherRole).toBeUndefined();
    expect(resolveTeacher({ ...base, formTeacherId: undefined })).toMatchObject({ teacherId: '', teacherName: '' });
  });

  it('falls back to the stored department and role on update', () => {
    const data = { departmentId: 'dOld', teacherRole: 'senior_teacher' };
    expect(resolveTeacher({ ...base, formTeacherId: 'u9', type: 'update', data })).toMatchObject({ departmentId: 'dOld', teacherRole: 'senior_teacher' });
  });

  it('gives an admin who is the teacher the admin’s own department', () => {
    expect(resolveTeacher({ ...base, formTeacherId: 'me' }).departmentId).toBe('dMine');
  });
});

describe('buildAssignmentPayload', () => {
  const formData = { ...valid, type: 'homework', status: 'published', gradingMode: 'gradebook', gradebookColumnId: 'col1', rubricId: 'r1', description: 'Do it' } as AssignmentFormOutput;
  const teacher = { teacherId: 'u1', teacherName: 'Ms One', departmentId: 'd1' as string | undefined, teacherRole: 'regular_teacher' as const };
  const names = { termName: 'Term 1', subjectName: 'Math', className: '1A' };

  it('builds the document to create, with the optional fields that are set', () => {
    const p = buildAssignmentPayload({ institutionId: 'i1', formData, type: 'create', data: undefined, ...names, teacher }) as Record<string, unknown>;
    expect(p).toMatchObject({
      institutionId: 'i1',
      termId: 't1',
      termName: 'Term 1',
      subjectName: 'Math',
      className: '1A',
      teacherId: 'u1',
      teacherName: 'Ms One',
      departmentId: 'd1',
      teacherRole: 'regular_teacher',
      dueDate: '2026-10-30',
      description: 'Do it',
      title: 'Fractions quiz',
      type: 'homework',
      status: 'published',
      gradingMode: 'gradebook',
      gradebookColumnId: 'col1',
      rubricId: 'r1',
    });
    expect(p.dueDateTimestamp).toBeInstanceOf(Timestamp);
    expect('otherTypeLabel' in p).toBe(false);
  });

  it('leaves out an unset department, description, column and rubric on create', () => {
    const p = buildAssignmentPayload({
      institutionId: 'i1',
      formData: { ...formData, description: '', gradingMode: 'standalone', gradebookColumnId: '', rubricId: '' },
      type: 'create',
      data: undefined,
      ...names,
      teacher: { ...teacher, departmentId: undefined },
    }) as Record<string, unknown>;
    for (const key of ['departmentId', 'description', 'gradebookColumnId', 'rubricId']) expect(key in p, key).toBe(false);
  });

  it('keeps the “other” label only for the Other type', () => {
    const other = buildAssignmentPayload({ institutionId: 'i1', formData: { ...formData, type: 'other', otherTypeLabel: 'Field trip' }, type: 'create', data: undefined, ...names, teacher }) as Record<string, unknown>;
    expect(other.otherTypeLabel).toBe('Field trip');
  });

  it('clears the optional fields it no longer has on update, and takes the grading mode and column from the stored document', () => {
    const data = { gradingMode: 'standalone', gradebookColumnId: 'oldCol', termName: 'Old term', subjectName: 'Old subject', className: 'Old class' };
    const p = buildAssignmentPayload({
      institutionId: 'i1',
      formData: { ...formData, rubricId: '', gradingMode: 'gradebook', gradebookColumnId: 'col9' },
      type: 'update',
      data,
      termName: undefined,
      subjectName: undefined,
      className: undefined,
      teacher,
    }) as Record<string, unknown>;
    expect(p.gradingMode).toBe('standalone'); // the stored mode, whatever the form says
    expect(p.termName).toBe('Old term'); // the live lookup had not loaded
    expect(p.subjectName).toBe('Old subject');
    expect(p.className).toBe('Old class');
    // fields cleared on update are written as Firestore delete markers, not omitted
    for (const key of ['otherTypeLabel', 'gradebookColumnId', 'rubricId']) expect(key in p, key).toBe(true);
    expect(p.rubricId).not.toBe('');
  });

  it('uses blank names on create when the lookups come up empty', () => {
    const p = buildAssignmentPayload({ institutionId: 'i1', formData, type: 'create', data: undefined, termName: undefined, subjectName: undefined, className: undefined, teacher }) as Record<string, unknown>;
    expect(p).toMatchObject({ termName: '', subjectName: '', className: '' });
  });
});
