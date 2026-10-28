import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import ExamTypeFields from '../../components/forms/exam/ExamTypeFields';
import OnlineExamFields, { BudgetNote } from '../../components/forms/exam/OnlineExamFields';
import type { ExamFormValues } from '../../components/forms/exam/examFormSchema';
import { estimateExamWrites } from '../examBudget';
import { EXAM_CATEGORY_LABELS, EXAM_CATEGORY_TYPES, EXAM_VALUE_TYPE_LABELS, EXAM_VALUE_TYPES } from '@/types/exams';
import examFormRaw from '../../components/forms/ExamForm.tsx?raw';
import examSchemaRaw from '../../components/forms/exam/examFormSchema.ts?raw';

// The exam form's type and online-settings fields (EXAMS_FEATURE_SPEC.md §4.1) and how ExamForm uses them.

const norm = (s: string) => s.split('\r\n').join('\n');
const form = norm(examFormRaw);

function typeFields(over: Partial<Parameters<typeof ExamTypeFields>[0]> = {}) {
  function Harness() {
    const { register, formState } = useForm<ExamFormValues>();
    return createElement(ExamTypeFields, {
      register,
      errors: formState.errors,
      valueType: '',
      categoryType: '',
      answerMode: 'single',
      lockCategoryAndMode: false,
      online: false,
      ...over,
    });
  }
  return renderToStaticMarkup(createElement(Harness));
}

function onlineFields(over: Partial<Parameters<typeof OnlineExamFields>[0]> = {}) {
  function Harness() {
    const { register, formState } = useForm<ExamFormValues>();
    return createElement(OnlineExamFields, {
      register,
      errors: formState.errors,
      online: true,
      alreadyOnline: false,
      answerMode: 'single',
      releaseMode: 'manual',
      integrity: 'supervised',
      published: false,
      budget: null,
      students: null,
      onWindowEdited: vi.fn(),
      ...over,
    });
  }
  return renderToStaticMarkup(createElement(Harness));
}

describe('ExamTypeFields', () => {
  it('lists every type, and the "Other" name box only for the type Other', () => {
    const html = typeFields();
    for (const t of EXAM_VALUE_TYPES) expect(html).toContain(`>${EXAM_VALUE_TYPE_LABELS[t]}</option>`);
    expect(html).not.toContain('Name of the type');
    expect(typeFields({ valueType: 'other' })).toContain('Name of the type');
  });

  it('lists all twelve categories but enables only Multiple Choice', () => {
    const html = typeFields();
    for (const c of EXAM_CATEGORY_TYPES) expect(html).toContain(EXAM_CATEGORY_LABELS[c]);
    const categorySelect = html.slice(html.indexOf('>None</option>'));
    const options = [...categorySelect.matchAll(/<option value="([a-z_]+)"([^>]*)>/g)].filter((m) => (EXAM_CATEGORY_TYPES as readonly string[]).includes(m[1]));
    expect(options.map((m) => m[1])).toEqual([...EXAM_CATEGORY_TYPES]);
    const enabled = options.filter((m) => !m[2].includes('disabled')).map((m) => m[1]);
    expect(enabled).toEqual(['multiple_choice']);
    expect(html).toContain('Short Answer (coming soon)');
    expect(html).toContain('Drag-and-drop (coming soon)');
    expect(html).not.toContain('Multiple Choice (coming soon)');
  });

  it('shows the answer mode only for Multiple Choice, with its description', () => {
    expect(typeFields()).not.toContain('Answer mode');
    const html = typeFields({ categoryType: 'multiple_choice', answerMode: 'multiple' });
    expect(html).toContain('Answer mode');
    for (const label of ['Single-answer', 'Multiple-answer', 'Both']) expect(html).toContain(`>${label}</option>`);
    expect(html).toContain('select all that apply');
  });

  it('locks the category and answer mode once the exam has questions', () => {
    const free = typeFields({ categoryType: 'multiple_choice' });
    const locked = typeFields({ categoryType: 'multiple_choice', lockCategoryAndMode: true });
    expect((free.match(/<select[^>]*disabled=""/g) ?? []).length).toBe(0);
    expect((locked.match(/<select[^>]*disabled=""/g) ?? []).length).toBe(2);
    expect(locked).toContain('fixed once an exam has questions');
  });

  it('marks the title, type and category optional for a schedule-only exam and required for an online one', () => {
    expect(typeFields()).toContain('Title (optional)');
    expect(typeFields({ online: true })).toContain('>Title</label>');
    expect(typeFields({ online: true })).not.toContain('(optional)');
  });
});

describe('OnlineExamFields', () => {
  it('shows only the checkbox until the exam is online', () => {
    const html = onlineFields({ online: false });
    expect(html).toContain('Online exam');
    expect(html).not.toContain('Opens');
    expect(html).not.toContain('Auto-Grade');
  });

  it('shows the window, release, checkpoint, Auto-Grade and shuffle settings for an online exam', () => {
    const html = onlineFields();
    for (const text of ['Opens', 'Closes', 'Show students the score', 'Save answers every', 'Auto-Grade', 'Shuffle the questions']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('type="datetime-local"');
    for (const m of ['5 minutes', '10 minutes', '15 minutes']) expect(html).toContain(m);
  });

  it('asks for a scoring mode only when a question can have several answers', () => {
    expect(onlineFields({ answerMode: 'single' })).not.toContain('Multiple-answer scoring');
    expect(onlineFields({ answerMode: 'both' })).toContain('Multiple-answer scoring');
    expect(onlineFields({ answerMode: 'multiple' })).toContain('Partial credit');
  });

  it('asks for a release time only for a scheduled release', () => {
    expect(onlineFields({ releaseMode: 'manual' })).not.toContain('Release scores at');
    expect(onlineFields({ releaseMode: 'scheduled' })).toContain('Release scores at');
  });

  it('cannot be switched off once the saved exam is online, and says why', () => {
    const html = onlineFields({ alreadyOnline: true });
    expect(html).toMatch(/<input type="checkbox" disabled/);
    expect(html).toContain('cannot be turned back');
    expect(onlineFields()).not.toMatch(/<input type="checkbox" disabled/);
  });

  it('warns on a published exam that running attempts keep their deadline', () => {
    expect(onlineFields({ published: true })).toContain('keep the deadline they started with');
    expect(onlineFields({ published: false })).not.toContain('keep the deadline they started with');
  });
});

describe('BudgetNote', () => {
  it('gives the writes for a counted class as a share of the daily limit', () => {
    const budget = estimateExamWrites({ students: 30, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'auto' });
    const html = renderToStaticMarkup(createElement(BudgetNote, { budget, students: 30 }));
    expect(html).toContain('30 students');
    expect(html).toContain(`${budget.writes.toLocaleString('en-US')} writes`);
    expect(html).toContain('of the 10,000 daily limit');
    expect(html).not.toContain('free plan');
    expect(html).toMatch(/% of the 10,000 daily limit, plus about [\d,]+ reads\. Spread large sittings over several days\./);
    expect(html).toContain('Spread large sittings');
  });

  it('says the class has not been counted when its size is unknown', () => {
    const budget = estimateExamWrites({ students: 1, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'auto' });
    const html = renderToStaticMarkup(createElement(BudgetNote, { budget, students: null }));
    expect(html).toContain('has not been counted');
    expect(html).toContain(`about ${budget.writesPerStudent} writes`);
  });

  it('renders nothing without a budget', () => {
    expect(renderToStaticMarkup(createElement(BudgetNote, { budget: null, students: 5 }))).toBe('');
  });
});

describe('ExamForm', () => {
  it('checks the online fields with the same settings checks as the rules, only when the exam is online', () => {
    expect(norm(examSchemaRaw)).toContain('onlineFormErrors(online)');
    expect(norm(examSchemaRaw)).toContain('.superRefine(');
    expect(form).toContain('resolver: zodResolver(examSchema)');
  });

  it('saves an online exam and its audit entry in one batch, and a plain exam as before', () => {
    expect(form).toContain('const batch = writeBatch(db);');
    expect(form).toContain('eventType: "exam_edit"');
    expect(form).toContain('await batch.commit();');
    expect(form).toContain('await addDoc(institutionCollection(institutionId, "exams")');
    expect(form).toContain('await updateDoc(institutionDoc(institutionId, "exams", id as string), payload);');
    expect(form).toContain('...(formData.online ? onlineFields(values, saved) : plainExamLabels(values))');
  });

  it('never sends a status, key revision or counts itself (onlineFields adds them only for a new online exam)', () => {
    const payload = form.slice(form.indexOf('const payload = {'), form.indexOf('if (!institutionId) return;', form.indexOf('const payload = {')));
    for (const key of ['status:', 'keyRevision:', 'questionCount:', 'totalPoints:']) expect(payload).not.toContain(key);
  });

  it('follows the date, start time and duration for the window until the person edits it', () => {
    expect(form).toContain('windowDefaults(watchedDate, watchedStartTime, watchedDuration ?? "")');
    expect(form).toContain('windowEdited.current = true;');
    expect(form).toContain('onWindowEdited=');
  });

  it('makes a finalized exam read-only and passes the category lock to the fields', () => {
    expect(form).toContain('locks.readOnly');
    expect(form).toContain('{!locks.readOnly && (');
    expect(form).toContain('lockCategoryAndMode={locks.lockCategoryAndMode}');
  });

  it('stays under the 600-line limit', () => {
    expect(form.split('\n').length).toBeLessThan(600);
  });
});
