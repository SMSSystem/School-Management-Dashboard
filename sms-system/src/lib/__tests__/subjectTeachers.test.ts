import { describe, expect, it } from 'vitest';
import {
  assistantFields,
  assistantOf,
  formatSubjectTeachers,
  leadTeacher,
  leadTeachers,
  subjectTeacherList,
  toggleTeacherLists,
  withoutTeacher,
} from '../subjectTeachers';
import subjectFormRaw from '../../components/forms/SubjectForm.tsx?raw';
import teacherFormRaw from '../../components/forms/TeacherForm.tsx?raw';
import executorRaw from '../deleteUserExecutor.ts?raw';
import reportCardRaw from '../generateReportCard.ts?raw';
import progressRaw from '../generateProgressReport.ts?raw';
import gradebookRaw from '../../scenes/(dashboard)/list/gradebook/index.tsx?raw';

// A subject's optional assistant teacher is a LABEL on one of its teachers (same access),
// so the logic is pure list handling plus "keep the label valid" in every place a teacher
// leaves a subject, and "never name the assistant on a report".

const norm = (s: string) => s.split('\r\n').join('\n');
const subjectForm = norm(subjectFormRaw);
const teacherForm = norm(teacherFormRaw);
const executor = norm(executorRaw);
const reportCard = norm(reportCardRaw);
const progress = norm(progressRaw);
const gradebook = norm(gradebookRaw);

const subject = {
  teacherIds: ['a', 'b', 'c'],
  teacherNames: ['Ann', 'Bo', 'Cy'],
  assistantTeacherId: 'a',
  assistantTeacherName: 'Ann',
};

describe('subjectTeacherList and assistantOf', () => {
  it('pairs ids with names, falling back to the id', () => {
    expect(subjectTeacherList({ teacherIds: ['a', 'b'], teacherNames: ['Ann'] })).toEqual([
      { id: 'a', name: 'Ann' },
      { id: 'b', name: 'b' },
    ]);
    expect(subjectTeacherList({})).toEqual([]);
  });

  it('finds the assistant only while it is still one of the teachers', () => {
    expect(assistantOf(subject)).toEqual({ id: 'a', name: 'Ann' });
    expect(assistantOf({ ...subject, teacherIds: ['b', 'c'], teacherNames: ['Bo', 'Cy'] })).toBeNull();
    expect(assistantOf({ teacherIds: ['a'], teacherNames: ['Ann'] })).toBeNull();
  });
});

describe('lead teacher', () => {
  it('never names the assistant, even when it is first in the list', () => {
    expect(leadTeachers(subject).map((t) => t.id)).toEqual(['b', 'c']);
    expect(leadTeacher(subject)).toEqual({ id: 'b', name: 'Bo' });
  });

  it('is the first teacher when there is no assistant', () => {
    expect(leadTeacher({ teacherIds: ['a', 'b'], teacherNames: ['Ann', 'Bo'] })).toEqual({ id: 'a', name: 'Ann' });
  });

  it('falls back to the assistant when it is the only teacher, and to null when there are none', () => {
    expect(leadTeacher({ teacherIds: ['a'], teacherNames: ['Ann'], assistantTeacherId: 'a' })).toEqual({ id: 'a', name: 'Ann' });
    expect(leadTeacher({})).toBeNull();
  });
});

describe('toggleTeacherLists', () => {
  it('adds to both arrays, and removes by id so two teachers with one name stay separate', () => {
    expect(toggleTeacherLists(['a'], ['Ann'], 'b', 'Bo')).toEqual({ ids: ['a', 'b'], names: ['Ann', 'Bo'] });
    expect(toggleTeacherLists(['a', 'b'], ['Sam', 'Sam'], 'b', 'Sam')).toEqual({ ids: ['a'], names: ['Sam'] });
  });
});

describe('assistantFields', () => {
  it('stores the assistant with its aligned name, and nothing for none or a non-teacher', () => {
    expect(assistantFields(['a', 'b'], ['Ann', 'Bo'], 'b')).toEqual({ assistantTeacherId: 'b', assistantTeacherName: 'Bo' });
    expect(assistantFields(['a', 'b'], ['Ann', 'Bo'], '')).toBeNull();
    expect(assistantFields(['a', 'b'], ['Ann', 'Bo'], null)).toBeNull();
    expect(assistantFields(['a'], ['Ann'], 'z')).toBeNull();
  });
});

describe('withoutTeacher', () => {
  it('removes the teacher from both arrays and flags the assistant label for removal', () => {
    expect(withoutTeacher(subject, 'a')).toEqual({ teacherIds: ['b', 'c'], teacherNames: ['Bo', 'Cy'], clearAssistant: true });
    expect(withoutTeacher(subject, 'b')).toEqual({ teacherIds: ['a', 'c'], teacherNames: ['Ann', 'Cy'], clearAssistant: false });
    expect(withoutTeacher({}, 'a')).toEqual({ teacherIds: [], teacherNames: [], clearAssistant: false });
  });
});

describe('formatSubjectTeachers', () => {
  it('tags only the assistant', () => {
    expect(formatSubjectTeachers(subject)).toBe('Ann (Assistant), Bo, Cy');
    expect(formatSubjectTeachers({ teacherIds: ['b'], teacherNames: ['Bo'] })).toBe('Bo');
  });
});

describe('keeping the label valid and off the reports', () => {
  it('the subject form offers only the ticked teachers, resets on unticking, and deletes the fields when none', () => {
    expect(subjectForm).toContain('Assistant teacher (optional)');
    expect(subjectForm).toContain('{selectedTeacherIds.map((id, i) => (');
    expect(subjectForm).toContain('if (id === assistantId && !next.ids.includes(id)) setAssistantId("");');
    expect(subjectForm).toContain('assistantTeacherId: deleteField(), assistantTeacherName: deleteField()');
    expect(subjectForm).toContain('assistantFields(formData.teacherIds, formData.teacherNames, assistantId)');
  });

  it('removing a teacher from a subject also clears the assistant label (teacher form and delete user)', () => {
    expect(teacherForm).toContain('withoutTeacher(subject, uid)');
    expect(teacherForm).toContain('removed.clearAssistant');
    expect(executor).toContain('withoutTeacher(d.data(), uid)');
    expect(executor).toContain('op.next.clearAssistant');
    expect(executor).toContain('teacherNames: op.next.teacherNames');
    expect(executor).not.toContain('arrayRemove');
  });

  it('report cards, progress reports and the gradebook name the lead teacher, not teacherIds[0]', () => {
    expect(reportCard).not.toContain('teacherIds?.[0]');
    expect(progress).not.toContain('teacherIds?.[0]');
    expect(reportCard.match(/leadTeacher\(subj\)\?\.id/g)).toHaveLength(2);
    expect(progress).toContain('leadTeacher(subj)?.id');
    expect(gradebook).not.toContain('teacherNames?.[0]');
    expect(gradebook).toContain('leadTeacher(subjectDoc)?.name');
  });
});
