import { describe, expect, it } from 'vitest';
import hookRaw from '../../hooks/useActivityLog.ts?raw';
import runningRaw from '../../hooks/useRunningAttempt.ts?raw';
import attemptRaw from '../../hooks/useExamAttempt.ts?raw';
import startRaw from '../../components/exam/take/ExamStartScreen.tsx?raw';

// The hook that feeds the activity log from the page (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.3).
// The rules of the log are tested without a browser in examActivity.test.ts, including the count against trackAway; the
// test environment has no DOM, so what the hook listens to and how it uses the clock is pinned here as text.

const norm = (s: string) => s.split('\r\n').join('\n');
const hook = norm(hookRaw);
const running = norm(runningRaw);

describe('useActivityLog', () => {
  it('watches the page going out of sight and losing or regaining focus, and counts a leave once through applyObservation', () => {
    for (const listener of ['document.addEventListener("visibilitychange", observe)', 'window.addEventListener("blur", observe)', 'window.addEventListener("focus", observe)']) {
      expect(hook, listener).toContain(listener);
    }
    expect(hook).toContain('applyObservation(');
    expect(hook).toContain('if (step.counted) {');
    expect(hook).toContain('setTabSwitches((n) => n + 1)');
  });

  it('times a leave with the monotonic clock and counts seconds from the start on the server-corrected clock', () => {
    expect(hook).toContain('perfNow: performance.now()');
    expect(hook).toContain('Date.now() + offsetMs - startedAtMs');
  });

  it('starts a leave at once when the page is reloaded while out of sight, and only then', () => {
    expect(hook).toContain('if (document.visibilityState !== "visible") observe();');
  });

  it('records copy, cut, print and the context menu and never blocks them', () => {
    for (const pair of ['["copy", act("copy")]', '["cut", act("cut")]', '["beforeprint", act("print")]', '["contextmenu", act("menu")]']) {
      expect(hook, pair).toContain(pair);
    }
    expect(hook).not.toContain('preventDefault');
    expect(hook).not.toContain('paste');
  });

  it('gives a checkpoint the log with an open leave showing its time so far', () => {
    expect(hook).toContain('snapshotEvents(eventsRef.current, away.current, clock())');
  });

  it('is what the running attempt uses for the log, the leave count and the answer times, and trackAway is no longer called there', () => {
    expect(running).toContain('useActivityLog({');
    expect(running).toContain('markAnswered(questionId)');
    expect(running).toContain('...readActivity()');
    // the checkpoint's dependencies hold the stable function, never the object that is new on every render
    expect(running).toContain('offsetMs, readActivity]');
    expect(running).not.toMatch(/\[[^\]]*activity\]/);
    expect(running).not.toContain('trackAway');
    expect(running).not.toContain('setTabSwitches');
  });

  it('is started from the attempt, with the time it started and the log merged from the server and the backup', () => {
    const attempt = norm(attemptRaw);
    expect(attempt).toContain('startedAtMs: attempt.startedAt');
    expect(attempt).toContain('events: merged.events');
    expect(attempt).toContain('answeredAt: merged.answeredAt');
  });

  it('is told to the student before they start, in the words of the notice', () => {
    expect(norm(startRaw)).toContain(
      'This exam records when you leave this page (by switching to another tab or window) and when you copy or print. Your teacher can see it.',
    );
  });
});
