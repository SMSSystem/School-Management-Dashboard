import { describe, expect, it } from 'vitest';
import { EXAM_LIMITS, type ExamActivityEvent } from '@/types/exams';
import { trackAway } from '../examAttemptLogic';
import {
  ACT_MERGE_SECONDS,
  EXAM_ACTIVITY_THRESHOLDS,
  INITIAL_AWAY,
  addAct,
  applyObservation,
  compactTimeline,
  mergeEvents,
  reviewNeeded,
  snapshotEvents,
  summarizeActivity,
  type AwayState,
  type Observation,
} from '../examActivity';
import activityRaw from '../examActivity.ts?raw';
import attemptLogicRaw from '../examAttemptLogic.ts?raw';

// The activity log's rules (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.3, §9.4): one entry per leave, its time away, acts,
// the merge with the local backup, the summary and the compact timeline. No browser, no Firebase.

const norm = (s: string) => s.split('\r\n').join('\n');
const IN: Observation = { visible: true, focused: true };
const BLUR: Observation = { visible: true, focused: false };
const HIDDEN: Observation = { visible: false, focused: false };
const HIDDEN_FOCUSED: Observation = { visible: false, focused: true };

// perfNow in milliseconds, secondsSinceStart in whole seconds (the same moment on both clocks, 1 s apart in the tests).
const at = (seconds: number) => ({ perfNow: 50_000 + seconds * 1000, secondsSinceStart: seconds });

function run(steps: [Observation, number][]) {
  let events: readonly ExamActivityEvent[] = [];
  let away: AwayState = INITIAL_AWAY;
  let counted = 0;
  for (const [obs, seconds] of steps) {
    const r = applyObservation(events, away, obs, at(seconds));
    events = r.events;
    away = r.away;
    if (r.counted) counted += 1;
  }
  return { events, away, counted };
}

describe('applyObservation', () => {
  it('opens a hidden entry when the page goes out of sight and closes it with the seconds away', () => {
    const out = run([[HIDDEN, 100]]);
    expect(out.events).toEqual([{ t: 100, k: 'hidden', d: 0 }]);
    expect(out.counted).toBe(1);
    expect(out.away.presence).toBe('hidden');
    const back = run([[HIDDEN, 100], [IN, 131]]);
    expect(back.events).toEqual([{ t: 100, k: 'hidden', d: 31 }]);
    expect(back.away).toEqual(INITIAL_AWAY);
    expect(back.counted).toBe(1);
  });

  it('records a window that only lost focus as blur', () => {
    const out = run([[BLUR, 40], [IN, 47]]);
    expect(out.events).toEqual([{ t: 40, k: 'blur', d: 7 }]);
    expect(out.counted).toBe(1);
  });

  it('makes a blur leave hidden when the page then goes out of sight, as one leave', () => {
    const out = run([[BLUR, 10], [HIDDEN, 11], [HIDDEN, 12], [IN, 70]]);
    expect(out.events).toEqual([{ t: 10, k: 'hidden', d: 60 }]);
    expect(out.counted).toBe(1);
  });

  it('keeps a hidden leave hidden when the page comes back into sight without focus, until focus returns', () => {
    const mid = run([[HIDDEN, 10], [BLUR, 20]]);
    expect(mid.events).toEqual([{ t: 10, k: 'hidden', d: 0 }]);
    expect(mid.away.presence).toBe('hidden');
    expect(mid.counted).toBe(1);
    expect(run([[HIDDEN, 10], [BLUR, 20], [IN, 25]]).events).toEqual([{ t: 10, k: 'hidden', d: 15 }]);
  });

  it('treats out of sight with focus as hidden (focus is only reported by a visible page in some browsers)', () => {
    expect(run([[HIDDEN_FOCUSED, 5], [IN, 9]]).events).toEqual([{ t: 5, k: 'hidden', d: 4 }]);
  });

  it('changes nothing for a repeated observation', () => {
    const once = run([[HIDDEN, 100]]);
    const again = run([[HIDDEN, 100], [HIDDEN, 101], [HIDDEN, 102]]);
    expect(again.events).toEqual(once.events);
    expect(again.counted).toBe(1);
    const present = run([[IN, 1], [IN, 2]]);
    expect(present.events).toEqual([]);
    expect(present.counted).toBe(0);
  });

  it('counts a second leave after the student has come back, with its own entry', () => {
    const out = run([[HIDDEN, 10], [IN, 20], [BLUR, 30], [IN, 33]]);
    expect(out.events).toEqual([
      { t: 10, k: 'hidden', d: 10 },
      { t: 30, k: 'blur', d: 3 },
    ]);
    expect(out.counted).toBe(2);
  });

  it('leaves a leave that never returns open, with no time yet', () => {
    const out = run([[IN, 1], [HIDDEN, 500]]);
    expect(out.events).toEqual([{ t: 500, k: 'hidden', d: 0 }]);
    expect(out.away.presence).toBe('hidden');
  });

  it('never gives a negative time when the clock goes backwards', () => {
    let r = applyObservation([], INITIAL_AWAY, HIDDEN, { perfNow: 9000, secondsSinceStart: 5 });
    r = applyObservation(r.events, r.away, IN, { perfNow: 8000, secondsSinceStart: 4 });
    expect(r.events).toEqual([{ t: 5, k: 'hidden', d: 0 }]);
  });

  it('does not change the events or the state it was given', () => {
    const events: readonly ExamActivityEvent[] = Object.freeze([{ t: 1, k: 'hidden' as const, d: 0 }]);
    const away: AwayState = Object.freeze({ presence: 'hidden' as const, startedPerf: 50_000, index: 0 });
    const r = applyObservation(events, away, IN, at(9));
    expect(events).toEqual([{ t: 1, k: 'hidden', d: 0 }]);
    expect(away.presence).toBe('hidden');
    expect(r.events).not.toBe(events);
  });

  describe('at the cap', () => {
    const full = Array.from({ length: EXAM_LIMITS.maxActivityEvents }, (_, i): ExamActivityEvent => ({ t: i, k: 'hidden', d: 1 }));

    it('still counts a new leave but adds no entry, and a return closes nothing', () => {
      const r = applyObservation(full, INITIAL_AWAY, HIDDEN, at(900));
      expect(r.counted).toBe(true);
      expect(r.events).toBe(full);
      expect(r.away).toEqual({ presence: 'hidden', startedPerf: 50_000 + 900_000, index: null });
      const back = applyObservation(r.events, r.away, IN, at(950));
      expect(back.events).toBe(full);
      expect(back.away).toEqual(INITIAL_AWAY);
      expect(back.counted).toBe(false);
    });

    it('adds an entry at one below the cap and none at the cap', () => {
      expect(applyObservation(full.slice(1), INITIAL_AWAY, HIDDEN, at(900)).events).toHaveLength(EXAM_LIMITS.maxActivityEvents);
      expect(applyObservation(full, INITIAL_AWAY, HIDDEN, at(900)).events).toHaveLength(EXAM_LIMITS.maxActivityEvents);
    });
  });
});

// A small seeded generator, so the test is the same on every run and needs no library.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('replay against trackAway, the specification of the count', () => {
  it('counts the same leaves and is away at the same moments for thousands of random observations', () => {
    const observations: Observation[] = [IN, BLUR, HIDDEN, HIDDEN_FOCUSED];
    for (const seed of [1, 7, 42, 2026]) {
      const rand = seeded(seed);
      let events: readonly ExamActivityEvent[] = [];
      let away: AwayState = INITIAL_AWAY;
      let wasAway = false;
      let expected = 0;
      let counted = 0;
      for (let step = 0; step < 3000; step += 1) {
        const obs = observations[Math.floor(rand() * observations.length)];
        const old = trackAway(wasAway, obs);
        const next = applyObservation(events, away, obs, at(step));
        expect(next.counted, `seed ${seed} step ${step}`).toBe(old.counted);
        expect(next.away.presence !== 'present', `seed ${seed} step ${step}`).toBe(old.away);
        if (old.counted) expected += 1;
        if (next.counted) counted += 1;
        wasAway = old.away;
        events = next.events;
        away = next.away;
      }
      expect(counted).toBe(expected);
      expect(events.length).toBeLessThanOrEqual(EXAM_LIMITS.maxActivityEvents);
      // Every entry that fits is a leave, and the log holds as many entries as leaves up to the cap.
      expect(events.length).toBe(Math.min(expected, EXAM_LIMITS.maxActivityEvents));
    }
  });
});

describe('snapshotEvents', () => {
  it('gives an open leave its time so far without changing the list it was given', () => {
    const r = applyObservation([], INITIAL_AWAY, HIDDEN, at(100));
    const snap = snapshotEvents(r.events, r.away, at(160));
    expect(snap).toEqual([{ t: 100, k: 'hidden', d: 60 }]);
    expect(r.events).toEqual([{ t: 100, k: 'hidden', d: 0 }]);
    // later still, and then closed by the return: the last value wins
    expect(snapshotEvents(r.events, r.away, at(400))).toEqual([{ t: 100, k: 'hidden', d: 300 }]);
    expect(applyObservation(r.events, r.away, IN, at(420)).events).toEqual([{ t: 100, k: 'hidden', d: 320 }]);
  });

  it('returns the list as it is when nothing is open, or the log was full', () => {
    const closed = run([[HIDDEN, 1], [IN, 3]]);
    expect(snapshotEvents(closed.events, closed.away, at(50))).toBe(closed.events);
    const events: readonly ExamActivityEvent[] = [{ t: 1, k: 'copy' }];
    expect(snapshotEvents(events, { presence: 'hidden', startedPerf: 1, index: null }, at(50))).toBe(events);
  });
});

describe('addAct', () => {
  it('adds an act with its time and no duration', () => {
    expect(addAct([], 'copy', at(30))).toEqual([{ t: 30, k: 'copy' }]);
  });

  it('merges the same kind within two seconds and adds it after that', () => {
    let events: readonly ExamActivityEvent[] = addAct([], 'copy', at(30));
    events = addAct(events, 'copy', at(30 + ACT_MERGE_SECONDS));
    expect(events).toHaveLength(1);
    events = addAct(events, 'copy', at(30 + ACT_MERGE_SECONDS + 1));
    expect(events).toHaveLength(2);
  });

  it('does not merge different kinds, and looks back past other entries', () => {
    let events: readonly ExamActivityEvent[] = addAct([], 'copy', at(30));
    events = addAct(events, 'print', at(31));
    events = addAct(events, 'copy', at(32));
    expect(events.map((e) => e.k)).toEqual(['copy', 'print']);
  });

  it('refuses a leave kind and adds nothing at the cap', () => {
    // @ts-expect-error a leave is not an act
    expect(addAct([], 'hidden', at(1))).toEqual([]);
    const full = Array.from({ length: EXAM_LIMITS.maxActivityEvents }, (_, i): ExamActivityEvent => ({ t: i, k: 'menu' }));
    expect(addAct(full, 'copy', at(999))).toBe(full);
  });
});

describe('mergeEvents', () => {
  const a: ExamActivityEvent[] = [
    { t: 10, k: 'hidden', d: 5 },
    { t: 40, k: 'copy' },
  ];
  const b: ExamActivityEvent[] = [
    { t: 10, k: 'hidden', d: 9 },
    { t: 25, k: 'blur', d: 2 },
  ];

  it('is the union by time and kind, in time order, with the longer time away', () => {
    expect(mergeEvents(a, b)).toEqual([
      { t: 10, k: 'hidden', d: 9 },
      { t: 25, k: 'blur', d: 2 },
      { t: 40, k: 'copy' },
    ]);
  });

  it('gives the same list whichever copy comes first, and again when merged twice', () => {
    expect(mergeEvents(b, a)).toEqual(mergeEvents(a, b));
    expect(mergeEvents(mergeEvents(a, b), b)).toEqual(mergeEvents(a, b));
  });

  it('is never shorter than either copy, so the log never shrinks', () => {
    expect(mergeEvents(a, [])).toEqual(a);
    expect(mergeEvents([], a)).toEqual(a);
    expect(mergeEvents(undefined, undefined)).toEqual([]);
    expect(mergeEvents(a, b).length).toBeGreaterThanOrEqual(Math.max(a.length, b.length));
  });

  it('does not change the lists it was given', () => {
    const copy = JSON.parse(JSON.stringify(a)) as ExamActivityEvent[];
    mergeEvents(a, b);
    expect(a).toEqual(copy);
  });

  it('keeps entries of a kind it does not know, and drops malformed ones', () => {
    const newer = [{ t: 5, k: 'tilt' }, { t: Number.NaN, k: 'copy' }, { k: 'copy' }] as unknown as ExamActivityEvent[];
    expect(mergeEvents(newer, a)).toEqual([{ t: 5, k: 'tilt' } as unknown as ExamActivityEvent, ...a]);
  });

  it('keeps the oldest entries at the cap', () => {
    const many = Array.from({ length: EXAM_LIMITS.maxActivityEvents + 10 }, (_, i): ExamActivityEvent => ({ t: i, k: 'menu' }));
    const merged = mergeEvents(many, []);
    expect(merged).toHaveLength(EXAM_LIMITS.maxActivityEvents);
    expect(merged[0].t).toBe(0);
    expect(merged[merged.length - 1].t).toBe(EXAM_LIMITS.maxActivityEvents - 1);
  });
});

describe('compactTimeline', () => {
  const leave = (t: number, d: number, k: 'hidden' | 'blur' = 'hidden'): ExamActivityEvent => ({ t, k, d });

  it('keeps everything, in time order, when it fits', () => {
    const events = [leave(30, 4), { t: 20, k: 'copy' as const }, leave(10, 9)];
    expect(compactTimeline(events)).toEqual([leave(10, 9), { t: 20, k: 'copy' }, leave(30, 4)]);
  });

  it('keeps the longest spells away first, then acts, then writes them in time order', () => {
    const events = [leave(1, 5), leave(2, 50), leave(3, 20), { t: 4, k: 'print' as const }, leave(5, 20)];
    expect(compactTimeline(events, 3)).toEqual([leave(2, 50), leave(3, 20), leave(5, 20)]);
    // a fourth place goes to the next longest leave, not to the act
    expect(compactTimeline(events, 4).map((e) => e.t)).toEqual([1, 2, 3, 5]);
    expect(compactTimeline(events, 5).map((e) => e.t)).toEqual([1, 2, 3, 4, 5]);
  });

  it('stops at the limit of the grade, 50 entries by default', () => {
    const events = Array.from({ length: 120 }, (_, i) => leave(i, i % 7));
    expect(compactTimeline(events)).toHaveLength(EXAM_LIMITS.maxTimelineEntries);
    expect(compactTimeline(events, 0)).toEqual([]);
  });

  it('skips entries of an unknown kind and does not change the list', () => {
    const events = [{ t: 1, k: 'tilt' } as unknown as ExamActivityEvent, leave(2, 3)];
    expect(compactTimeline(events)).toEqual([leave(2, 3)]);
    expect(events).toHaveLength(2);
  });
});

describe('reviewNeeded', () => {
  it('needs more leaves than the preset allows for the length of the exam', () => {
    // a 10-minute quiz: the floor of two leaves applies; a 3-hour exam is allowed 18 (supervised) or 9 (unsupervised)
    expect(reviewNeeded(2, 0, 600, 'supervised')).toBe(false);
    expect(reviewNeeded(3, 0, 600, 'supervised')).toBe(true);
    expect(reviewNeeded(3, 0, 3 * 3600, 'supervised')).toBe(false);
    expect(reviewNeeded(18, 0, 3 * 3600, 'supervised')).toBe(false);
    expect(reviewNeeded(19, 0, 3 * 3600, 'supervised')).toBe(true);
    expect(reviewNeeded(9, 0, 3 * 3600, 'unsupervised')).toBe(false);
    expect(reviewNeeded(10, 0, 3 * 3600, 'unsupervised')).toBe(true);
  });

  it('needs more time away than the preset allows as a share of the exam', () => {
    expect(reviewNeeded(1, 180, 3600, 'supervised')).toBe(false); // 5% of an hour is 180 s
    expect(reviewNeeded(1, 181, 3600, 'supervised')).toBe(true);
    expect(reviewNeeded(1, 72, 3600, 'unsupervised')).toBe(false); // 2% is 72 s
    expect(reviewNeeded(1, 73, 3600, 'unsupervised')).toBe(true);
  });

  it('is stricter for an unsupervised exam than a supervised one for the same figures', () => {
    expect(reviewNeeded(5, 0, 3600, 'supervised')).toBe(false);
    expect(reviewNeeded(5, 0, 3600, 'unsupervised')).toBe(true);
  });

  it('judges a non-positive duration by the leaves alone', () => {
    expect(reviewNeeded(2, 9999, 0, 'supervised')).toBe(false);
    expect(reviewNeeded(3, 0, -5, 'unsupervised')).toBe(true);
  });

  it('keeps its proposals as named constants', () => {
    expect(EXAM_ACTIVITY_THRESHOLDS).toEqual({
      minLeaves: 2,
      supervised: { leavesPerHour: 6, awayShare: 0.05 },
      unsupervised: { leavesPerHour: 3, awayShare: 0.02 },
      fastAnswerSeconds: 3,
      fastAnswerMinAnswered: 10,
    });
  });
});

describe('summarizeActivity', () => {
  const events: ExamActivityEvent[] = [
    { t: 10, k: 'hidden', d: 40 },
    { t: 60, k: 'blur', d: 5 },
    { t: 70, k: 'copy' },
    { t: 80, k: 'tilt' as never },
    { t: 90, k: 'hidden', d: 100 },
  ];

  it('counts leaves, hidden leaves, time away, the longest spell and acts, and keeps a compact timeline', () => {
    const s = summarizeActivity({ events, tabSwitches: 3, durationSeconds: 3600, preset: 'supervised' });
    expect(s).toMatchObject({ leaves: 3, hiddenLeaves: 2, awaySeconds: 145, longestAwaySeconds: 100, acts: 1, review: false });
    expect(s.timeline.map((e) => e.t)).toEqual([10, 60, 70, 90]);
    expect('fastAnswers' in s).toBe(false);
  });

  it('uses tabSwitches for the leaves when the log was full and so held fewer entries', () => {
    expect(summarizeActivity({ events: [], tabSwitches: 240, durationSeconds: 3600, preset: 'supervised' }).leaves).toBe(240);
    expect(summarizeActivity({ events, tabSwitches: 1, durationSeconds: 3600, preset: 'supervised' }).leaves).toBe(3);
    expect(summarizeActivity({ events, durationSeconds: 3600, preset: 'supervised' }).leaves).toBe(3);
  });

  it('asks for a Review from the preset and the length of the exam', () => {
    expect(summarizeActivity({ events, tabSwitches: 3, durationSeconds: 600, preset: 'supervised' }).review).toBe(true);
    expect(summarizeActivity({ events: [], tabSwitches: 0, durationSeconds: 600, preset: 'unsupervised' }).review).toBe(false);
  });

  it('counts fast answers only when ten questions have a time', () => {
    const few = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`q${i}`, i]));
    expect('fastAnswers' in summarizeActivity({ events: [], answeredAt: few, durationSeconds: 600, preset: 'supervised' })).toBe(false);
    // ten answers: gaps of 1, 1, 1, 30, 1, 2, 3, 10, 1 seconds -> five are under 3 seconds (3 is not)
    const times = [0, 1, 2, 3, 33, 34, 36, 39, 49, 50];
    const ten = Object.fromEntries(times.map((t, i) => [`q${i}`, t]));
    expect(summarizeActivity({ events: [], answeredAt: ten, durationSeconds: 600, preset: 'supervised' }).fastAnswers).toBe(6);
  });

  it('ignores a time away that is missing or negative', () => {
    const s = summarizeActivity({ events: [{ t: 1, k: 'hidden' }, { t: 2, k: 'blur', d: -4 }], durationSeconds: 600, preset: 'supervised' });
    expect([s.awaySeconds, s.longestAwaySeconds, s.leaves]).toEqual([0, 0, 2]);
  });
});

describe('the module', () => {
  it('is pure: it imports only the exam types and touches no clock, page or Firebase', () => {
    const text = norm(activityRaw);
    expect([...text.matchAll(/^import [\s\S]*? from '([^']+)';/gm)].map((m) => m[1])).toEqual(['@/types/exams']);
    // comments may name the page and the clock; only the code may not use them
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of ['Date.now', 'performance.now', 'document.', 'window.', 'firebase', 'react']) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('leaves trackAway where it is, as the specification of the count', () => {
    expect(norm(attemptLogicRaw)).toContain('export function trackAway(');
  });
});
