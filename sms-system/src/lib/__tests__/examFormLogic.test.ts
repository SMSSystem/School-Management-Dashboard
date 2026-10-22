import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  formLocks,
  fromLocalInput,
  issuesToFieldErrors,
  newOnlineDefaults,
  onlineFields,
  onlineFormErrors,
  onlineValuesFromExam,
  plainExamLabels,
  settingsFromForm,
  toLocalInput,
  windowDefaults,
  type ExamOnlineFormValues,
} from '../examFormLogic';
import { validateExamSettings } from '../examSettings';
import rulesRaw from '../../../firestore.rules?raw';

// The Add/Edit Exam form's online-exam fields (EXAMS_FEATURE_SPEC.md §4.1).

const norm = (s: string) => s.split('\r\n').join('\n');
const local = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).getTime();

const valid: ExamOnlineFormValues = {
  ...newOnlineDefaults(),
  online: true,
  title: 'Unit 3 Quiz',
  valueType: 'quiz',
  categoryType: 'multiple_choice',
  answerMode: 'single',
  opensAt: '2026-11-02T09:00',
  closesAt: '2026-11-02T10:15',
  duration: '45',
};

describe('datetime-local values', () => {
  it('round-trip in the local time zone', () => {
    const ms = local(2026, 11, 2, 9, 5);
    expect(toLocalInput(ms)).toBe('2026-11-02T09:05');
    expect(fromLocalInput('2026-11-02T09:05')).toBe(ms);
    expect(fromLocalInput(toLocalInput(ms))).toBe(ms);
  });

  it('give undefined for empty or unreadable text', () => {
    expect(fromLocalInput('')).toBeUndefined();
    expect(fromLocalInput(undefined)).toBeUndefined();
    expect(fromLocalInput('2026-11-02')).toBeUndefined();
    expect(fromLocalInput('tomorrow')).toBeUndefined();
  });
});

describe('windowDefaults', () => {
  it('opens at the start time and closes after the duration plus 15 minutes', () => {
    expect(windowDefaults('2026-11-02', '09:00', '45')).toEqual({ opensAt: '2026-11-02T09:00', closesAt: '2026-11-02T10:00' });
  });

  it('opens at 08:00 without a start time', () => {
    expect(windowDefaults('2026-11-02', '', '30')?.opensAt).toBe('2026-11-02T08:00');
  });

  it('is null until the date and a usable duration are there', () => {
    expect(windowDefaults('', '09:00', '45')).toBeNull();
    expect(windowDefaults('2026-11-02', '09:00', '')).toBeNull();
    expect(windowDefaults('2026-11-02', '09:00', '0')).toBeNull();
    expect(windowDefaults('2026-11-02', '09:00', 'abc')).toBeNull();
  });
});

describe('settingsFromForm and the problems it reports', () => {
  it('turns valid form values into settings that pass the checks', () => {
    const s = settingsFromForm(valid);
    expect(s).toMatchObject({ title: 'Unit 3 Quiz', valueType: 'quiz', categoryType: 'multiple_choice', durationMinutes: 45, checkpointMinutes: 10 });
    expect(s.opensAtMs).toBe(local(2026, 11, 2, 9, 0));
    expect(validateExamSettings(s)).toEqual([]);
    expect(onlineFormErrors(valid)).toEqual([]);
  });

  it('keeps the starting values valid once the exam is given a title, type, category and window', () => {
    expect(onlineFormErrors({ ...newOnlineDefaults(), online: true })).not.toEqual([]);
    expect(onlineFormErrors(valid)).toEqual([]);
  });

  it('reports nothing for an exam that is not online', () => {
    expect(onlineFormErrors({ ...newOnlineDefaults(), online: false })).toEqual([]);
  });

  it('puts each problem on its own field, one message per field', () => {
    const errors = onlineFormErrors({ ...valid, title: '', duration: '3', closesAt: '2026-11-02T08:00', categoryType: 'short_answer' });
    const paths = errors.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['title', 'duration', 'closesAt', 'categoryType']));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('needs a release time for a scheduled release, not before the close, and ignores it otherwise', () => {
    expect(onlineFormErrors({ ...valid, releaseMode: 'scheduled' }).map((e) => e.path)).toEqual(['releaseAt']);
    expect(onlineFormErrors({ ...valid, releaseMode: 'scheduled', releaseAt: '2026-11-02T09:30' }).map((e) => e.path)).toEqual(['releaseAt']);
    expect(onlineFormErrors({ ...valid, releaseMode: 'scheduled', releaseAt: '2026-11-03T09:30' })).toEqual([]);
    expect(onlineFormErrors({ ...valid, releaseMode: 'manual', releaseAt: 'garbage' })).toEqual([]);
  });

  it('needs a scoring mode choice only for answer modes that allow several answers', () => {
    expect(onlineFormErrors({ ...valid, answerMode: 'both', scoringMode: '' }).map((e) => e.path)).toEqual(['scoringMode']);
    expect(onlineFormErrors({ ...valid, answerMode: 'single', scoringMode: '' })).toEqual([]);
  });

  it('maps an unknown problem code to the title field rather than losing it', () => {
    expect(issuesToFieldErrors([{ code: 'something_new', message: 'x' }])).toEqual([{ path: 'title', message: 'x' }]);
  });
});

describe('onlineFields', () => {
  it('writes the online fields, with Timestamps for the window, and starts a new exam as a draft', () => {
    const f = onlineFields(valid, null);
    expect(f).toMatchObject({
      online: true,
      title: 'Unit 3 Quiz',
      valueType: 'quiz',
      categoryType: 'multiple_choice',
      answerMode: 'single',
      duration: 45,
      scoringMode: 'all_or_nothing',
      autoGrade: false,
      releaseMode: 'manual',
      releaseAt: null,
      shuffle: true,
      checkpointMinutes: 10,
      status: 'draft',
      keyRevision: 1,
      questionCount: 0,
      totalPoints: 0,
    });
    expect(f.opensAt).toBeInstanceOf(Timestamp);
    expect((f.closesAt as Timestamp).toMillis()).toBe(local(2026, 11, 2, 10, 15));
  });

  it('does not send the status, key revision or counts for an exam that is already online', () => {
    const f = onlineFields(valid, { online: true });
    for (const key of ['status', 'keyRevision', 'questionCount', 'totalPoints']) expect(f, key).not.toHaveProperty(key);
    expect(onlineFields(valid, { online: false })).toHaveProperty('status', 'draft');
  });

  it('names the type for "Other" and sets a scheduled release as a Timestamp', () => {
    const f = onlineFields({ ...valid, valueType: 'other', valueTypeLabel: '  Spelling bee ', releaseMode: 'scheduled', releaseAt: '2026-11-03T09:30' }, null);
    expect(f.valueTypeLabel).toBe('Spelling bee');
    expect((f.releaseAt as Timestamp).toMillis()).toBe(local(2026, 11, 3, 9, 30));
    expect(onlineFields(valid, null)).not.toHaveProperty('valueTypeLabel');
  });

  it('writes only keys the rules accept for an online exam', () => {
    const start = norm(rulesRaw).indexOf('function isValidOnlineExam(d)');
    const fn = norm(rulesRaw).slice(start, norm(rulesRaw).indexOf('// A new online exam starts', start));
    const allowed = new Set([...fn.slice(fn.indexOf('hasOnly(['), fn.indexOf(']', fn.indexOf('hasOnly(['))).matchAll(/'([^']+)'/g)].map((m) => m[1]));
    const written = Object.keys({
      ...onlineFields({ ...valid, valueType: 'other', valueTypeLabel: 'x', releaseMode: 'scheduled', releaseAt: '2026-11-03T09:30' }, null),
    });
    for (const key of written) expect(allowed.has(key), key).toBe(true);
  });
});

describe('plainExamLabels', () => {
  it('carries only what was filled in', () => {
    expect(plainExamLabels(newOnlineDefaults())).toEqual({});
    expect(plainExamLabels({ ...newOnlineDefaults(), title: ' Mid-term ', valueType: 'test', categoryType: 'multiple_choice' })).toEqual({
      title: 'Mid-term',
      valueType: 'test',
      categoryType: 'multiple_choice',
    });
    expect(plainExamLabels({ ...newOnlineDefaults(), valueType: 'other', valueTypeLabel: 'Oral' })).toEqual({ valueType: 'other', valueTypeLabel: 'Oral' });
  });
});

describe('formLocks', () => {
  it('makes a finalized exam read-only and locks the category and answer mode once there are questions', () => {
    expect(formLocks({ status: 'finalized' })).toEqual({ readOnly: true, lockCategoryAndMode: false });
    expect(formLocks({ status: 'draft', questionCount: 3 })).toEqual({ readOnly: false, lockCategoryAndMode: true });
    expect(formLocks({ status: 'published', questionCount: 0 })).toEqual({ readOnly: false, lockCategoryAndMode: false });
    expect(formLocks(undefined)).toEqual({ readOnly: false, lockCategoryAndMode: false });
  });
});

describe('onlineValuesFromExam', () => {
  it('reads a stored online exam back into form values', () => {
    const opens = Timestamp.fromMillis(local(2026, 11, 2, 9, 0));
    const values = onlineValuesFromExam({
      online: true,
      title: 'Unit 3 Quiz',
      valueType: 'quiz',
      categoryType: 'multiple_choice',
      answerMode: 'both',
      opensAt: opens,
      closesAt: Timestamp.fromMillis(local(2026, 11, 2, 10, 15)),
      duration: 45,
      scoringMode: 'partial',
      autoGrade: true,
      releaseMode: 'scheduled',
      releaseAt: Timestamp.fromMillis(local(2026, 11, 3, 9, 30)),
      shuffle: false,
      checkpointMinutes: 5,
    });
    expect(values).toMatchObject({
      online: true,
      answerMode: 'both',
      opensAt: '2026-11-02T09:00',
      closesAt: '2026-11-02T10:15',
      duration: '45',
      scoringMode: 'partial',
      autoGrade: true,
      releaseMode: 'scheduled',
      releaseAt: '2026-11-03T09:30',
      shuffle: false,
      checkpointMinutes: '5',
    });
  });

  it('falls back to the starting values for a plain exam', () => {
    expect(onlineValuesFromExam({ date: '2026-11-02' })).toEqual(newOnlineDefaults());
  });
});
