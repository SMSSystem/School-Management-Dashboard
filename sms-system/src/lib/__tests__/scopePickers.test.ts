import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ScopePickers from '../../components/forms/ScopePickers';
import resultFormRaw from '../../components/forms/ResultForm.tsx?raw';
import feedbackFormRaw from '../../components/forms/FeedbackCommentForm.tsx?raw';

// The Subject, Student, (class) and Term pickers of the Add/Edit Result and Add/Edit Feedback Comment forms were
// two copies of ~100 lines; they live in components/forms/ScopePickers.tsx now. The browser check (the forms'
// HTML at five states for the admin and both teachers, identical before and after) is in
// prod-bundle-e2e/result-feedback-forms-dom.spec.ts; this pins the pieces a browser run on the QA data cannot
// reach (no student there lacks a class).

const lf = (s: string) => s.split('\r\n').join('\n');
const register = (name: string) => ({ name, onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() });
const props = {
  register: register as never,
  setValue: vi.fn() as never,
  errors: {} as never,
  defaults: {},
  subjects: [{ id: 's1', name: 'Maths' }],
  terms: [{ id: 't1', name: 'Term 1' }],
  classes: [{ id: 'c1', name: '5A' }],
  students: [{ uid: 'u1', name: 'Ann', classId: 'c1' }],
  studentOptions: [{ uid: 'u1', name: 'Ann', classId: 'c1' }],
  studentHasNoClass: false,
  onSubjectChange: vi.fn(),
  onStudentChosen: vi.fn(),
};
const html = (over: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(ScopePickers, { ...props, ...over } as never));

describe('ScopePickers markup', () => {
  it('lists Subject, Student and Term in that order, with a hidden classId and the placeholder options', () => {
    const out = html();
    const order = ['>Subject<', '>Student<', 'name="classId"', '>Term<'].map((t) => out.indexOf(t));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const text of ['Select a subject', 'Select a student', 'Select a term', 'Maths', 'Ann', 'Term 1']) expect(out).toContain(text);
    expect(out).toContain('type="hidden"');
    expect(out).not.toContain('Select a class');
  });

  it('shows a manual class picker, with its warning, only for a student that has no home class', () => {
    const out = html({ studentHasNoClass: true });
    expect(out).toContain('(student has no assigned class — select manually)');
    expect(out).toContain('Select a class');
    expect(out).toContain('5A');
  });

  it('shows each field error under its picker', () => {
    const errors = {
      subjectId: { message: 'Subject is required.' },
      studentId: { message: 'Student is required.' },
      termId: { message: 'Term is required.' },
      classId: { message: 'Class is required.' },
    };
    const out = html({ errors, studentHasNoClass: true });
    for (const m of ['Subject is required.', 'Student is required.', 'Term is required.', 'Class is required.']) expect(out).toContain(m);
  });

  it('starts an edited row from its saved values', () => {
    const out = html({ defaults: { subjectId: 's1', studentId: 'u1', termId: 't1', classId: 'c1' } });
    expect(out).toContain('value="c1"');
  });
});

describe('the two forms', () => {
  it('use it and no longer hold their own copy of the pickers', () => {
    for (const [name, src] of [['ResultForm', resultFormRaw], ['FeedbackCommentForm', feedbackFormRaw]] as const) {
      const text = lf(src);
      expect(text, name).toContain('<ScopePickers');
      expect(text, name).not.toContain('Select a subject');
      expect(text, name).not.toContain('student has no assigned class');
    }
  });

  it('keep deciding what the student list shows from the chosen subject, and the manual-class flag from the student', () => {
    for (const [name, src] of [['ResultForm', resultFormRaw], ['FeedbackCommentForm', feedbackFormRaw]] as const) {
      const text = lf(src);
      expect(text, name).toMatch(/onSubjectChange=\{\(id\) =>\s*setSelectedSubject\(liveSubjects\.find\(\(s\) => s\.id === id\) \?\? null\)\s*\}/);
      expect(text, name).toContain('onStudentChosen={(hasClass) => setStudentHasNoClass(!hasClass)}');
    }
  });
});
