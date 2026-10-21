import { describe, expect, it } from 'vitest';
import {
  finalizeBlockers,
  gradeNeedsRegrade,
  isReleased,
  needsResultSync,
  releaseAtFor,
  studentsToRelease,
} from '../examRelease';

// When a score becomes visible, and what must be true before an exam is finalized (EXAMS_FEATURE_SPEC.md §6).

const T0 = 1_800_000_000_000;
const MIN = 60_000;

describe('releaseAtFor', () => {
  it('releases at the grading time when set to "as soon as graded"', () => {
    expect(releaseAtFor('auto', T0, null)).toBe(T0);
    expect(releaseAtFor('auto', T0, T0 + 5 * MIN)).toBe(T0);
  });

  it('releases at the exam’s set time when scheduled, and keeps a grade hidden if there is no time', () => {
    expect(releaseAtFor('scheduled', T0, T0 + 60 * MIN)).toBe(T0 + 60 * MIN);
    expect(releaseAtFor('scheduled', T0, null)).toBeNull();
    expect(releaseAtFor('scheduled', T0, undefined)).toBeNull();
  });

  it('holds the grade until the teacher presses Release', () => {
    expect(releaseAtFor('manual', T0, T0 + MIN)).toBeNull();
  });
});

describe('isReleased', () => {
  it('is true from the release time on (the rule compares releaseAt <= request.time)', () => {
    expect(isReleased(T0, T0)).toBe(true);
    expect(isReleased(T0, T0 + 1)).toBe(true);
    expect(isReleased(T0, T0 - 1)).toBe(false);
  });

  it('is false with no release time', () => {
    expect(isReleased(null, T0)).toBe(false);
    expect(isReleased(undefined, T0)).toBe(false);
  });
});

describe('gradeNeedsRegrade', () => {
  it('flags an automatic grade made with an older key', () => {
    expect(gradeNeedsRegrade({ method: 'auto', keyRevision: 1 }, 2)).toBe(true);
    expect(gradeNeedsRegrade({ method: 'auto', keyRevision: 2 }, 2)).toBe(false);
  });

  it('leaves a score a teacher entered or overrode alone', () => {
    expect(gradeNeedsRegrade({ method: 'manual', keyRevision: 1 }, 5)).toBe(false);
  });
});

describe('needsResultSync and studentsToRelease', () => {
  it('syncs a score only once it is released and not yet in the results', () => {
    expect(needsResultSync({ releaseAtMs: T0, resultSynced: false }, T0)).toBe(true);
    expect(needsResultSync({ releaseAtMs: T0, resultSynced: true }, T0)).toBe(false);
    expect(needsResultSync({ releaseAtMs: T0 + MIN, resultSynced: false }, T0)).toBe(false);
    expect(needsResultSync({ releaseAtMs: null, resultSynced: false }, T0)).toBe(false);
  });

  it('lists the students whose grades have no release time yet', () => {
    expect(
      studentsToRelease([
        { studentId: 'a', releaseAtMs: null },
        { studentId: 'b', releaseAtMs: T0 },
        { studentId: 'c', releaseAtMs: undefined },
      ]),
    ).toEqual(['a', 'c']);
  });
});

describe('finalizeBlockers', () => {
  const grade = (studentId: string, over: Partial<{ releaseAtMs: number | null; resultSynced: boolean }> = {}) => ({
    studentId, method: 'auto' as const, keyRevision: 1, releaseAtMs: T0 - MIN, resultSynced: true, ...over,
  });
  const attempt = (studentId: string, status: 'in_progress' | 'submitted', deadlineAtMs = T0 - 30 * MIN) => ({ studentId, status, deadlineAtMs });
  const codes = (input: Parameters<typeof finalizeBlockers>[0]) => finalizeBlockers(input).map((i) => i.code);

  it('has nothing in the way when every attempt is graded, released and synced', () => {
    expect(codes({ attempts: [attempt('a', 'submitted'), attempt('b', 'submitted')], grades: [grade('a'), grade('b')], nowMs: T0 })).toEqual([]);
    expect(codes({ attempts: [], grades: [], nowMs: T0 })).toEqual([]);
  });

  it('is blocked by an attempt still running before its deadline', () => {
    expect(codes({ attempts: [attempt('a', 'in_progress', T0 + 10 * MIN)], grades: [], nowMs: T0 })).toEqual(['attempts_running']);
  });

  it('counts an attempt past its deadline and grace as needing a grade, not as running', () => {
    expect(codes({ attempts: [attempt('a', 'in_progress', T0 - 5 * MIN)], grades: [], nowMs: T0 })).toEqual(['ungraded']);
    // Inside the 60-second grace it is still running.
    expect(codes({ attempts: [attempt('a', 'in_progress', T0 - 30_000)], grades: [], nowMs: T0 })).toEqual(['attempts_running']);
  });

  it('is blocked by a submitted attempt with no grade', () => {
    const blockers = finalizeBlockers({ attempts: [attempt('a', 'submitted'), attempt('b', 'submitted')], grades: [grade('a')], nowMs: T0 });
    expect(blockers.map((b) => b.code)).toEqual(['ungraded']);
    expect(blockers[0].message).toBe('1 submitted attempt has no grade yet.');
  });

  it('is blocked by unreleased and by unsynced grades, and says how many', () => {
    const blockers = finalizeBlockers({
      attempts: [attempt('a', 'submitted'), attempt('b', 'submitted'), attempt('c', 'submitted')],
      grades: [grade('a', { releaseAtMs: null }), grade('b', { resultSynced: false }), grade('c', { releaseAtMs: T0 + MIN })],
      nowMs: T0,
    });
    expect(blockers.map((b) => b.code)).toEqual(['unreleased', 'unsynced']);
    expect(blockers[0].message).toBe('2 scores have not been released.');
    expect(blockers[1].message).toBe('1 released score is not yet in the results.');
  });
});
