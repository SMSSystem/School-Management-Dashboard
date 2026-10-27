import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import OnlineExamFields from '../../components/forms/exam/OnlineExamFields';
import { examSchema, type ExamFormValues } from '../../components/forms/exam/examFormSchema';
import { newOnlineDefaults, onlineFields, onlineFormErrors, onlineValuesFromExam, settingsFromForm, type ExamOnlineFormValues } from '../examFormLogic';
import { validateExamSettings } from '../examSettings';
import { duplicateDefaults } from '../examDuplicate';
import { EXAM_INTEGRITY_OPTION_TEXT, EXAM_INTEGRITY_PRESETS } from '@/types/exams';
import rulesRaw from '../../../firestore.rules?raw';

// How an exam is supervised (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.2): the two fields of the form, how they
// are checked, what is written, and that an exam that never sets them is saved exactly as before.

const valid: ExamOnlineFormValues = {
  ...newOnlineDefaults(),
  title: 'Unit 3 Quiz',
  valueType: 'quiz',
  categoryType: 'multiple_choice',
  answerMode: 'single',
  online: true,
  opensAt: '2026-11-03T09:00',
  closesAt: '2026-11-03T11:00',
  duration: '45',
  autoGrade: true,
  releaseMode: 'auto',
};

describe('the starting values', () => {
  it('are supervised and free to move', () => {
    expect(newOnlineDefaults()).toMatchObject({ integrity: 'supervised', forwardOnly: false });
  });

  it('are read from a saved exam: absent means supervised, and forward only counts only with Unsupervised', () => {
    expect(onlineValuesFromExam({})).toMatchObject({ integrity: 'supervised', forwardOnly: false });
    expect(onlineValuesFromExam({ integrity: 'unsupervised', forwardOnly: true })).toMatchObject({ integrity: 'unsupervised', forwardOnly: true });
    expect(onlineValuesFromExam({ integrity: 'supervised', forwardOnly: true }).forwardOnly).toBe(false);
    expect(onlineValuesFromExam({ integrity: 'bogus' }).integrity).toBe('supervised');
  });
});

describe('what is written', () => {
  it('leaves both fields out for a new supervised exam, so it is saved exactly as before', () => {
    const f = onlineFields(valid, null);
    expect(f).not.toHaveProperty('integrity');
    expect(f).not.toHaveProperty('forwardOnly');
  });

  it('writes the preset for an unsupervised exam, and forward only only with it', () => {
    expect(onlineFields({ ...valid, integrity: 'unsupervised' }, null)).toMatchObject({ integrity: 'unsupervised' });
    expect(onlineFields({ ...valid, integrity: 'unsupervised' }, null)).not.toHaveProperty('forwardOnly');
    expect(onlineFields({ ...valid, integrity: 'unsupervised', forwardOnly: true }, null)).toMatchObject({ integrity: 'unsupervised', forwardOnly: true });
    // a stale tick under Supervised is ignored
    expect(onlineFields({ ...valid, integrity: 'supervised', forwardOnly: true }, null)).not.toHaveProperty('forwardOnly');
  });

  it('writes a change back to supervised and clears forward only when the saved exam had them', () => {
    const saved = { online: true, integrity: 'unsupervised', forwardOnly: true };
    expect(onlineFields({ ...valid, integrity: 'supervised' }, saved)).toMatchObject({ integrity: 'supervised', forwardOnly: false });
    expect(onlineFields({ ...valid, integrity: 'unsupervised', forwardOnly: false }, saved)).toMatchObject({ integrity: 'unsupervised', forwardOnly: false });
  });

  it('writes nothing about supervision when an already-supervised exam is saved again', () => {
    const f = onlineFields(valid, { online: true });
    expect(f).not.toHaveProperty('integrity');
    expect(f).not.toHaveProperty('forwardOnly');
  });

  it('writes only keys the rules accept', () => {
    const start = rulesRaw.indexOf('function isValidOnlineExam(d)');
    const keys = [...rulesRaw.slice(start, rulesRaw.indexOf(']', start)).matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]);
    const written = Object.keys(onlineFields({ ...valid, integrity: 'unsupervised', forwardOnly: true }, null));
    for (const key of ['integrity', 'forwardOnly']) {
      expect(written).toContain(key);
      expect(keys).toContain(key);
    }
  });
});

describe('the checks', () => {
  it('accept both presets and a missing one', () => {
    for (const integrity of EXAM_INTEGRITY_PRESETS) expect(validateExamSettings({ ...settingsFromForm(valid), integrity })).toEqual([]);
    expect(validateExamSettings({ ...settingsFromForm(valid), integrity: undefined })).toEqual([]);
  });

  it('refuse forward only on a supervised exam and name the field', () => {
    expect(validateExamSettings({ ...settingsFromForm(valid), integrity: 'supervised', forwardOnly: true }).map((i) => i.code)).toEqual(['forward_only']);
    expect(validateExamSettings({ ...settingsFromForm(valid), integrity: 'unsupervised', forwardOnly: true })).toEqual([]);
  });

  it('never show the form an error about a tick it has hidden', () => {
    expect(onlineFormErrors({ ...valid, integrity: 'supervised', forwardOnly: true })).toEqual([]);
  });

  it('are part of the form’s schema', () => {
    const base = { termId: 't', subjectId: 's', classId: 'c', teacherId: 'u', date: '2026-11-03', ...valid };
    expect(examSchema.safeParse(base).success).toBe(true);
    expect(examSchema.safeParse({ ...base, integrity: undefined }).success).toBe(false);
  });
});

describe('a copy of an exam', () => {
  it('starts with the same supervision', () => {
    const copy = duplicateDefaults({ id: 'e1', title: 'Quiz', integrity: 'unsupervised', forwardOnly: true });
    expect(copy).toMatchObject({ integrity: 'unsupervised', forwardOnly: true });
    expect(duplicateDefaults({ id: 'e1', title: 'Quiz' })).not.toHaveProperty('integrity');
  });
});

describe('the fields on the form', () => {
  function html(integrity: string) {
    function Harness() {
      const { register, formState } = useForm<ExamFormValues>();
      return createElement(OnlineExamFields, {
        register,
        errors: formState.errors,
        online: true,
        alreadyOnline: false,
        answerMode: 'single',
        releaseMode: 'manual',
        integrity,
        published: false,
        budget: null,
        students: null,
        onWindowEdited: vi.fn(),
      });
    }
    return renderToStaticMarkup(createElement(Harness));
  }

  it('shows the Supervision select with both choices and a hint under it', () => {
    const out = html('supervised');
    expect(out).toContain('>Supervision</label>');
    for (const preset of EXAM_INTEGRITY_PRESETS) expect(out).toContain(`>${EXAM_INTEGRITY_OPTION_TEXT[preset]}</option>`);
    const select = out.indexOf('id="integrity"');
    const hint = out.indexOf('Both record when a student leaves the page');
    expect(select).toBeGreaterThan(-1);
    expect(hint).toBeGreaterThan(select);
    expect(out).toContain('applies to attempts started afterwards');
  });

  it('shows the Forward only tick, with its hint, only for Unsupervised', () => {
    expect(html('supervised')).not.toContain('Forward only');
    const out = html('unsupervised');
    expect(out).toContain('Forward only');
    expect(out).toContain('cannot go back to one they have left');
  });

  it('keeps the labels of the two new fields to 24 characters', () => {
    for (const label of ['Supervision', 'Forward only']) expect(label.length).toBeLessThanOrEqual(24);
  });
});
