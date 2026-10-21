import { describe, expect, it } from 'vitest';
import {
  checkpointFields,
  cleanAnswers,
  cleanFlags,
  lateStartNote,
  mergeLocalDraft,
  newAttemptFields,
  submitFields,
  submitSummary,
  trackAway,
} from '../examAttemptLogic';
import type { ExamQuestion } from '@/types/exams';
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
    order: { questions: ['one'], options: { one: ['onea', 'oneb'] } },
  });

  it('a new attempt has exactly the keys the create rule lists, as an empty in-progress attempt', () => {
    const required = keysOf('function isValidAttemptStart');
    expect(Object.keys(start).sort()).toEqual([...required].sort());
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
      extraMinutes: 0, order: { questions: [], options: {} },
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
    expect(mergeLocalDraft(server, null)).toEqual({ answers: { one: ['onea'] }, flags: [], tabSwitches: 1, usedLocal: false });
  });

  it('never lowers the tab-switch count', () => {
    expect(mergeLocalDraft(server, local(500)).tabSwitches).toBe(3);
    expect(mergeLocalDraft({ ...server, tabSwitches: 9 }, local(1000)).tabSwitches).toBe(9);
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
