import { describe, expect, it } from 'vitest';
import {
  checkpointFields,
  classifyAttemptWrite,
  cleanAnsweredAt,
  cleanAnswers,
  cleanEvents,
  cleanFlags,
  lateStartNote,
  mergeLocalDraft,
  newAttemptFields,
  submitFields,
  submitSummary,
  trackAway,
} from '../examAttemptLogic';
import { EXAM_LIMITS, type ExamActivityEvent, type ExamQuestion } from '@/types/exams';
import rules from '../../../firestore.rules?raw';

// What an attempt writes and shows (EXAMS_FEATURE_SPEC.md §4.5, §5.4, §7).

const q = (id: string, kind: 'single' | 'multiple' = 'single'): ExamQuestion => ({
  id,
  text: id,
  kind,
  options: [
    { id: `${id}a`, text: 'A' },
    { id: `${id}b`, text: 'B' },
  ],
  points: 1,
});
const questions = [q('one'), q('two', 'multiple'), q('three')];

describe('cleanAnswers and cleanFlags', () => {
  it('keeps only answered questions, only their own options, without repeats', () => {
    expect(
      cleanAnswers(questions, { one: ['onea', 'onea', 'stranger'], two: [], three: ['threeb'], ghost: ['x'] }),
    ).toEqual({ one: ['onea'], three: ['threeb'] });
    expect(cleanAnswers(questions, {})).toEqual({});
  });

  it('keeps at most 100 questions', () => {
    const many = Array.from({ length: 120 }, (_, i) => q(`q${i}`));
    const answers = Object.fromEntries(many.map((m) => [m.id, [`${m.id}a`]]));
    expect(Object.keys(cleanAnswers(many, answers))).toHaveLength(100);
  });

  it('keeps only flags of questions that exist, once each', () => {
    expect(cleanFlags(questions, ['two', 'ghost', 'two', 'one'])).toEqual(['two', 'one']);
  });
});

describe('the fields written, against the attempt rules', () => {
  const rulesText = rules.split('\r\n').join('\n');
  const keysOf = (marker: string): string[] => {
    const at = rulesText.indexOf(marker);
    const open = rulesText.indexOf('[', at);
    return [...rulesText.slice(open, rulesText.indexOf(']', open)).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };
  const start = newAttemptFields({
    institutionId: 'inst',
    uid: 'stu',
    studentName: 'Ann Lee',
    classId: 'c1',
    startedAt: 'SERVER',
    deadlineAt: 'DEADLINE',
    lastSavedAt: 'SERVER',
    extraMinutes: 0,
    seed: 'abcdef0123456789',
  });

  it('a new attempt has exactly the keys the create rule lists, as an empty in-progress attempt', () => {
    // The create rule allows the activity log fields empty but does not require them: the app starts without them.
    const required = keysOf('function isValidAttemptStart').filter((k) => k !== 'events' && k !== 'answeredAt');
    expect(Object.keys(start).sort()).toEqual([...required].sort());
    expect(keysOf('function isValidAttemptStart')).toEqual(expect.arrayContaining(['events', 'answeredAt']));
    expect(start).toMatchObject({ status: 'in_progress', answers: {}, flags: [], tabSwitches: 0, studentId: 'stu', classId: 'c1' });
  });

  it('a checkpoint changes only the fields the update rule allows', () => {
    const allowed = keysOf("d.diff(o).affectedKeys().hasOnly(['answers'");
    const cp = checkpointFields({ questions, answers: { one: ['onea'] }, flags: ['two'], tabSwitches: 2, lastSavedAt: 'SERVER' });
    expect(Object.keys(cp).sort()).toEqual(['answers', 'flags', 'lastSavedAt', 'tabSwitches']);
    for (const key of Object.keys(cp)) expect(allowed).toContain(key);
  });

  it('a submit adds the status, the server time and the reason, all inside the same list', () => {
    const allowed = keysOf("d.diff(o).affectedKeys().hasOnly(['answers'");
    const sub = submitFields({ questions, answers: {}, flags: [], tabSwitches: 0, serverTime: 'SERVER', reason: 'timeout' });
    expect(sub).toMatchObject({ status: 'submitted', submittedAt: 'SERVER', lastSavedAt: 'SERVER', submitReason: 'timeout' });
    for (const key of Object.keys(sub)) expect(allowed).toContain(key);
  });

  it('cleans the answers it writes and never lowers or fractions the tab count', () => {
    const cp = checkpointFields({ questions, answers: { one: ['x'], two: ['twoa'] }, flags: ['ghost'], tabSwitches: 2.7, lastSavedAt: 'S' });
    expect(cp.answers).toEqual({ two: ['twoa'] });
    expect(cp.flags).toEqual([]);
    expect(cp.tabSwitches).toBe(2);
    expect(checkpointFields({ questions, answers: {}, flags: [], tabSwitches: -3, lastSavedAt: 'S' }).tabSwitches).toBe(0);
  });

  it('cuts the student name to the rule’s 200 characters', () => {
    const long = newAttemptFields({
      institutionId: 'i', uid: 'u', studentName: 'x'.repeat(300), classId: 'c', startedAt: 1, deadlineAt: 2, lastSavedAt: 1,
      extraMinutes: 0, seed: 'abcdef0123456789',
    });
    expect(String(long.studentName)).toHaveLength(200);
  });
});

describe('submitSummary', () => {
  it('counts the questions, the answered, the unanswered and the flagged', () => {
    expect(submitSummary(questions, { one: ['onea'], three: [] }, ['two', 'ghost'])).toEqual({
      total: 3,
      answered: 1,
      unanswered: 2,
      flagged: 1,
    });
  });
});

describe('lateStartNote', () => {
  const MIN = 60_000;
  const closesAtMs = 1_000_000_000_000;

  it('is null when the student has the full time', () => {
    expect(lateStartNote({ serverNowMs: closesAtMs - 60 * MIN, durationMinutes: 45, closesAtMs })).toBeNull();
    expect(lateStartNote({ serverNowMs: closesAtMs - 45 * MIN, durationMinutes: 45, closesAtMs })).toBeNull();
  });

  it('says how many minutes are left when the window closes first', () => {
    expect(lateStartNote({ serverNowMs: closesAtMs - 20 * MIN, durationMinutes: 45, closesAtMs })).toBe(
      'You have 20 minutes instead of 45, because the exam closes before the full time is up.',
    );
    expect(lateStartNote({ serverNowMs: closesAtMs - MIN, durationMinutes: 45, closesAtMs })).toContain('1 minute instead');
  });

  it('counts the extra time on both sides', () => {
    expect(lateStartNote({ serverNowMs: closesAtMs - 20 * MIN, durationMinutes: 45, extraMinutes: 15, closesAtMs })).toBe(
      'You have 35 minutes instead of 60, because the exam closes before the full time is up.',
    );
  });
});

describe('mergeLocalDraft', () => {
  const server = { answers: { one: ['onea'] }, flags: [], tabSwitches: 1, lastSavedMs: 1000 };
  const local = (baseLastSavedMs: number) => ({ answers: { one: ['oneb'], two: ['twoa'] }, flags: ['two'], tabSwitches: 3, baseLastSavedMs });

  it('uses the local copy when it was built on this checkpoint or a later one', () => {
    const merged = mergeLocalDraft(server, local(1000));
    expect(merged.usedLocal).toBe(true);
    expect(merged.answers).toEqual({ one: ['oneb'], two: ['twoa'] });
    expect(mergeLocalDraft(server, local(2000)).usedLocal).toBe(true);
  });

  it('uses the server copy when another device has saved since', () => {
    const merged = mergeLocalDraft(server, local(500));
    expect(merged.usedLocal).toBe(false);
    expect(merged.answers).toEqual({ one: ['onea'] });
  });

  it('uses the server copy when there is no local one', () => {
    expect(mergeLocalDraft(server, null)).toEqual({ answers: { one: ['onea'] }, flags: [], tabSwitches: 1, events: [], answeredAt: {}, usedLocal: false });
  });

  it('never lowers the tab-switch count', () => {
    expect(mergeLocalDraft(server, local(500)).tabSwitches).toBe(3);
    expect(mergeLocalDraft({ ...server, tabSwitches: 9 }, local(1000)).tabSwitches).toBe(9);
  });
});

describe('the activity log in a checkpoint and a submit', () => {
  const base = { questions, answers: {}, flags: [], tabSwitches: 2 };

  it('writes the log and the answer times only when they are given, so the old shape is unchanged', () => {
    expect(Object.keys(checkpointFields({ ...base, lastSavedAt: 'S' })).sort()).toEqual(['answers', 'flags', 'lastSavedAt', 'tabSwitches']);
    const withLog = checkpointFields({ ...base, lastSavedAt: 'S', events: [{ t: 5, k: 'hidden', d: 3 }], answeredAt: { one: 12 } });
    expect(withLog.events).toEqual([{ t: 5, k: 'hidden', d: 3 }]);
    expect(withLog.answeredAt).toEqual({ one: 12 });
    expect(submitFields({ ...base, serverTime: 'S', reason: 'student', events: [], answeredAt: {} })).toMatchObject({ events: [], answeredAt: {}, status: 'submitted' });
  });

  it('writes an empty log as an empty list, not as nothing', () => {
    expect(checkpointFields({ ...base, lastSavedAt: 'S', events: [] }).events).toEqual([]);
  });

  it('cleans the log: whole non-negative seconds, a kind and a time, at most 200, the oldest kept', () => {
    const messy = [
      { t: 4.6, k: 'blur', d: 2.4 },
      { t: -3, k: 'copy' },
      { t: Number.NaN, k: 'hidden' },
      { k: 'hidden' },
      { t: 9, k: 7 },
      { t: 10, k: 'hidden', d: -4 },
      { t: 11, k: 'tilt', d: Number.POSITIVE_INFINITY },
    ] as unknown as ExamActivityEvent[];
    expect(cleanEvents(messy)).toEqual([{ t: 5, k: 'blur', d: 2 }, { t: 0, k: 'copy' }, { t: 10, k: 'hidden', d: 0 }, { t: 11, k: 'tilt' }]);
    const many = Array.from({ length: 250 }, (_, i): ExamActivityEvent => ({ t: i, k: 'menu' }));
    const cleaned = cleanEvents(many);
    expect(cleaned).toHaveLength(EXAM_LIMITS.maxActivityEvents);
    expect(cleaned[0].t).toBe(0);
  });

  it('cleans the answer times: only questions that exist, whole non-negative seconds', () => {
    expect(cleanAnsweredAt(questions, { one: 12.4, two: -5, three: Number.NaN, ghost: 3 })).toEqual({ one: 12, two: 0 });
  });

  it('fits the keys the checkpoint rule allows', () => {
    const allowed = [...rules.split('\r\n').join('\n').matchAll(/affectedKeys\(\)\.hasOnly\(\['answers'([^\]]*)\]/g)].map((m) => m[0]).join('');
    for (const key of ['events', 'answeredAt']) expect(allowed).toContain(`'${key}'`);
  });
});

describe('mergeLocalDraft and the activity log', () => {
  const server = { answers: {}, flags: [], tabSwitches: 1, lastSavedMs: 1000 };
  const local = (over: Record<string, unknown> = {}) => ({ answers: {}, flags: [], tabSwitches: 1, baseLastSavedMs: 1000, ...over });

  it('keeps every entry of the server copy and of the local copy, whichever copy is used', () => {
    const s = { ...server, events: [{ t: 10, k: 'hidden' as const, d: 4 }] };
    const l = local({ events: [{ t: 10, k: 'hidden', d: 9 }, { t: 30, k: 'copy' }] });
    for (const baseLastSavedMs of [500, 1000, 2000]) {
      expect(mergeLocalDraft(s, local({ ...l, baseLastSavedMs })).events).toEqual([{ t: 10, k: 'hidden', d: 9 }, { t: 30, k: 'copy' }]);
    }
    expect(mergeLocalDraft(s, null).events).toEqual([{ t: 10, k: 'hidden', d: 4 }]);
  });

  it('is never shorter than either log, and a backup from before the log changes nothing', () => {
    const s = { ...server, events: [{ t: 1, k: 'hidden' as const, d: 1 }, { t: 5, k: 'blur' as const, d: 2 }] };
    expect(mergeLocalDraft(s, local()).events).toHaveLength(2);
    expect(mergeLocalDraft(server, local({ events: [{ t: 3, k: 'print' }] })).events).toHaveLength(1);
  });

  it('keeps the later answer time of each question', () => {
    const s = { ...server, answeredAt: { one: 30, two: 50 } };
    const l = local({ answeredAt: { one: 45, three: 5 } });
    expect(mergeLocalDraft(s, l).answeredAt).toEqual({ one: 45, two: 50, three: 5 });
    expect(mergeLocalDraft(s, local({ ...l, baseLastSavedMs: 1 })).answeredAt).toEqual({ one: 45, two: 50, three: 5 });
  });
});

describe('trackAway', () => {
  it('counts one leave however many events it fires', () => {
    let away = false;
    const steps = [
      { visible: true, focused: false }, // blur
      { visible: false, focused: false }, // then hidden
      { visible: false, focused: false },
    ];
    let counted = 0;
    for (const s of steps) {
      const r = trackAway(away, s);
      if (r.counted) counted += 1;
      away = r.away;
    }
    expect(counted).toBe(1);
  });

  it('counts again after the student has come back', () => {
    let away = false;
    let counted = 0;
    for (const s of [
      { visible: false, focused: false },
      { visible: true, focused: true },
      { visible: false, focused: true },
    ]) {
      const r = trackAway(away, s);
      if (r.counted) counted += 1;
      away = r.away;
    }
    expect(counted).toBe(2);
  });

  it('is not away while the page is visible and focused', () => {
    expect(trackAway(false, { visible: true, focused: true })).toEqual({ away: false, counted: false });
    expect(trackAway(true, { visible: true, focused: true })).toEqual({ away: false, counted: false });
  });
});

describe('classifyAttemptWrite', () => {
  const err = (code: string) => ({ code });

  it('reads a refusal as too late (the rules refuse after the deadline and a minute, or outside the window)', () => {
    expect(classifyAttemptWrite(err('permission-denied'))).toBe('too_late');
    expect(classifyAttemptWrite(err('PERMISSION_DENIED'))).toBe('too_late');
  });

  it('reads a lost connection as offline, so the student can try again', () => {
    for (const code of ['unavailable', 'network-request-failed', 'deadline-exceeded']) expect(classifyAttemptWrite(err(code))).toBe('offline');
  });

  it('calls anything else other', () => {
    expect(classifyAttemptWrite(err('invalid-argument'))).toBe('other');
    expect(classifyAttemptWrite(new Error('boom'))).toBe('other');
    expect(classifyAttemptWrite(null)).toBe('other');
  });
});
