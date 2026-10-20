import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import TermSubjectClassTeacherFields from '../../components/forms/TermSubjectClassTeacherFields';
import examFormRaw from '../../components/forms/ExamForm.tsx?raw';
import scopeFieldsRaw from '../../components/forms/assignment/AssignmentScopeFields.tsx?raw';

// The Term, Subject, Class and Teacher fields of the Exam form and the Assignment form were two copies of ~100
// lines. The browser comparison (the Add exam form's HTML at seven states for an administrator and both teachers,
// and the assignment form's, identical before and after) was done with local production-bundle Playwright captures
// (exam-form-dom and assignment-form-dom; the harness is not part of the repository); this pins what a capture cannot
// reach (a locked teacher field, error lines).

const lf = (s: string) => s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const register = (name: string) => ({ name, onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() });
const props = {
  register: register as never,
  setValue: vi.fn() as never,
  errors: {} as never,
  terms: [{ id: 't1', name: 'Term 1' }],
  subjects: [{ id: 's1', name: 'Maths' }],
  classOptions: [{ id: 'c1', name: '5A' }],
  teacherOptions: [{ id: 'u1', name: 'Ms Lee' }],
  isTeacherRole: false,
  lockedTeacherName: 'Mr Locked',
};
const html = (over: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(TermSubjectClassTeacherFields, { ...props, ...over } as never));

describe('TermSubjectClassTeacherFields markup', () => {
  it('lists Term, Subject, Class and Teacher in that order, each with its placeholder and options', () => {
    const out = html();
    const order = ['>Term<', '>Subject<', '>Class<', '>Teacher<'].map((t) => out.indexOf(t));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const text of ['Select a term', 'Select a subject', 'Select a class', 'Select a teacher', 'Term 1', 'Maths', '5A', 'Ms Lee']) {
      expect(out).toContain(text);
    }
  });

  it('shows a signed-in teacher as themselves, locked, with no teacher to pick', () => {
    const out = html({ isTeacherRole: true });
    expect(out).toContain('value="Mr Locked"');
    expect(out).toContain('disabled=""');
    expect(out).toContain('readOnly=""');
    expect(out).not.toContain('Select a teacher');
    expect(out).not.toContain('Ms Lee');
  });

  it('shows each field error under its field', () => {
    const errors = {
      termId: { message: 'Term is required.' },
      subjectId: { message: 'Subject is required.' },
      classId: { message: 'Class is required.' },
      teacherId: { message: 'Teacher is required.' },
    };
    const out = html({ errors });
    for (const m of ['Term is required.', 'Subject is required.', 'Class is required.', 'Teacher is required.']) expect(out).toContain(m);
  });
});

describe('the two forms', () => {
  it('use it and no longer hold their own copy of the four fields', () => {
    for (const [name, src] of [['ExamForm', examFormRaw], ['AssignmentScopeFields', scopeFieldsRaw]] as const) {
      const text = lf(src);
      expect(text, name).toContain('<TermSubjectClassTeacherFields');
      expect(text, name).not.toContain('Select a subject');
      expect(text, name).not.toContain('Select a teacher');
    }
  });

  it('the exam form takes its class and teacher options from the assignment form logic', () => {
    const text = lf(examFormRaw);
    expect(text).toContain('const classOptions = classOptionsFor(selectedSubject, classes);');
    expect(text).toContain('const teacherOptions = teacherOptionsFor(selectedSubject);');
    expect(text).not.toContain('selectedSubject.classScope');
  });

  it('the assignment fields keep their Title first and Due Date last around the shared four', () => {
    const text = lf(scopeFieldsRaw);
    const at = (needle: string) => text.indexOf(needle);
    expect(at('label="Title"')).toBeGreaterThan(-1);
    expect(at('label="Title"')).toBeLessThan(at('<TermSubjectClassTeacherFields'));
    expect(at('<TermSubjectClassTeacherFields')).toBeLessThan(at('label="Due Date"'));
  });
});
