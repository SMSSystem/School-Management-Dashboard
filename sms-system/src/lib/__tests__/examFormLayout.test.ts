import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import InputField from '../../components/InputField';
import TermSubjectClassTeacherFields from '../../components/forms/TermSubjectClassTeacherFields';
import FormSection from '../../components/forms/exam/FormSection';
import { ROOMY_INPUT_CLS, ROOMY_LABEL_MAX } from '../../components/forms/exam/examFormStyles';
import formRaw from '../../components/forms/ExamForm.tsx?raw';
import typeFieldsRaw from '../../components/forms/exam/ExamTypeFields.tsx?raw';
import onlineFieldsRaw from '../../components/forms/exam/OnlineExamFields.tsx?raw';
import assignmentScopeRaw from '../../components/forms/assignment/AssignmentScopeFields.tsx?raw';

// The Create / Edit / Duplicate exam form in the look of Edit Student Details (EXAMS_FEATURE_SPEC.md §4.1): labelled
// fields with bordered inputs, grouped under titled sections, with a Cancel and a Create / Update button. The shared
// field components keep their old look for every other form.

const norm = (s: string) => s.split('\r\n').join('\n');
const form = norm(formRaw);

function field(variant?: 'roomy') {
  function Harness() {
    const { register } = useForm<{ date: string }>();
    return createElement(InputField<{ date: string }>, { label: 'Date', name: 'date', type: 'date', register, variant });
  }
  return renderToStaticMarkup(createElement(Harness));
}

function scope(variant?: 'roomy') {
  function Harness() {
    const { register, setValue, formState } = useForm<{ termId: string }>();
    return createElement(TermSubjectClassTeacherFields<{ termId: string }>, {
      register,
      setValue,
      errors: formState.errors,
      terms: [{ id: 't', name: 'Term 1' }],
      subjects: [],
      classOptions: [],
      teacherOptions: [],
      isTeacherRole: false,
      lockedTeacherName: '',
      variant,
    });
  }
  return renderToStaticMarkup(createElement(Harness));
}

describe('the shared fields', () => {
  it('keep the look every other form has unless asked for the roomy one', () => {
    const plain = field();
    expect(plain).toContain('ring-[1.5px] ring-gray-300');
    expect(plain).toContain('w-full md:w-1/4');
    expect(plain).not.toContain('for="date"');
    const roomy = field('roomy');
    expect(roomy).toContain('for="date"');
    expect(roomy).toContain('id="date"');
    expect(roomy).toContain('focus:ring-2 focus:ring-sky-400');
    expect(roomy).toContain('border border-gray-300');
    expect(roomy).not.toContain('w-full md:w-1/4');
  });

  it('give the term, subject, class and teacher labelled fields in the roomy look only', () => {
    expect(scope()).not.toContain('for="termId"');
    const roomy = scope('roomy');
    for (const id of ['termId', 'subjectId', 'classId', 'teacherId']) {
      expect(roomy).toContain(`for="${id}"`);
      expect(roomy).toContain(`id="${id}"`);
    }
    expect(roomy).toContain(ROOMY_INPUT_CLS.split(' ')[1]);
    expect(norm(assignmentScopeRaw)).not.toContain('variant=');
  });
});

describe('the labels of the roomy fields', () => {
  // A label that wraps pushes its box below its neighbours' in the four-column grid, so a label stays short and the
  // explanation goes in a hint under the box.
  it('are written as literal text that fits on one line, and the long explanation is a hint', () => {
    const labels: string[] = [];
    for (const src of [form, norm(typeFieldsRaw), norm(onlineFieldsRaw)]) {
      for (const m of src.matchAll(/label="([^"]+)"/g)) labels.push(m[1]);
      for (const m of src.matchAll(/<label htmlFor="[^"]+" className=\{ROOMY_LABEL_CLS\}>\s*([^<{]+?)\s*</g)) labels.push(m[1]);
      for (const m of src.matchAll(/<label htmlFor="[^"]+" className=\{ROOMY_LABEL_CLS\}>\s*\{online \? "([^"]+)" : "([^"]+)"\}/g)) labels.push(m[1], m[2]);
    }
    expect(labels.length).toBeGreaterThan(15);
    for (const l of labels) expect(l.length, l).toBeLessThanOrEqual(ROOMY_LABEL_MAX);
    expect(labels).toContain('Duration (minutes)');
    expect(form).toContain('hint={');
  });

  it('give the input field an optional hint under the box in the roomy look only', () => {
    function withHint(variant?: 'roomy') {
      function Harness() {
        const { register } = useForm<{ duration: string }>();
        return createElement(InputField<{ duration: string }>, { label: 'Duration (minutes)', name: 'duration', register, variant, hint: 'Optional.' });
      }
      return renderToStaticMarkup(createElement(Harness));
    }
    const roomy = withHint('roomy');
    expect(roomy).toContain('id="duration-hint"');
    expect(roomy).toContain('aria-describedby="duration-hint"');
    expect(roomy).toContain('Optional.');
    const plain = withHint();
    expect(plain).not.toContain('Optional.');
    expect(plain).not.toContain('aria-describedby');
  });
});

describe('FormSection', () => {
  it('is a labelled group with a small uppercase title and a grid of fields, tinted when it is a panel', () => {
    const plain = renderToStaticMarkup(createElement(FormSection, { title: 'Type', children: createElement('span', null, 'x') }));
    expect(plain).toContain('<section');
    expect(plain).toContain('aria-labelledby=');
    expect(plain).toContain('uppercase');
    expect(plain).toContain('grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4');
    expect(plain).not.toContain('bg-sky-50');
    expect(renderToStaticMarkup(createElement(FormSection, { title: 'Online exam', panel: true, children: null }))).toContain('bg-sky-50');
  });
});

describe('the exam form', () => {
  it('groups its fields into the Exam details, Type and Online exam sections', () => {
    expect(form).toContain('<FormSection title="Exam details">');
    expect(form).toContain('<FormSection title="Type">');
    expect(form).toContain('<OnlineExamFields');
    expect(form.indexOf('title="Exam details"')).toBeLessThan(form.indexOf('title="Type"'));
    expect(form.indexOf('title="Type"')).toBeLessThan(form.indexOf('<OnlineExamFields'));
  });

  it('uses the roomy look for every field it lays out itself', () => {
    expect(form.match(/<InputField/g)).toHaveLength(4);
    expect(form.match(/variant="roomy"/g)).toHaveLength(5); // the four inputs and the shared term, subject, class, teacher fields
  });

  it('has a Cancel button that closes the form without saving, and the same Create and Update button as before', () => {
    expect(form).toContain('onClick={() => onClose?.()}');
    expect(form).toContain('{locks.readOnly ? "Close" : "Cancel"}');
    expect(form).toContain('{isSubmitting ? "Saving…" : type === "create" ? "Create" : "Update"}');
    expect(form).toContain('var(--brand-button-bg, #0284c7)');
  });
});
