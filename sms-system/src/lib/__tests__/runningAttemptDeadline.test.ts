import { describe, expect, it } from 'vitest';
import hookRaw from '../../hooks/useRunningAttempt.ts?raw';
import sessionRaw from '../examAttemptSession.ts?raw';

// How a running attempt learns that staff gave extra time (EXAMS_FEATURE_SPEC.md §6.7, §9): two reads of the deadline
// from the server, not one after every checkpoint.

const norm = (s: string) => s.split('\r\n').join('\n');
const hook = norm(hookRaw);
const session = norm(sessionRaw);

describe('reading the deadline', () => {
  it('reads it from the server, never the local copy of what this browser wrote', () => {
    const at = session.indexOf('export async function loadMyDeadline');
    expect(at).toBeGreaterThan(-1);
    expect(session.slice(at, at + 500)).toContain('getDocFromServer(attemptRef(');
  });

  it('does not read the attempt after a checkpoint any more', () => {
    const checkpoint = hook.slice(hook.indexOf('const checkpoint = useCallback'), hook.indexOf('const refreshDeadline'));
    expect(checkpoint).not.toContain('loadMy');
    expect(checkpoint).not.toContain('getDoc');
  });

  it('reads once when about a minute is left, and again at time-up before submitting, which it skips if the deadline moved', () => {
    expect(hook).toContain('deadlineRecheckDue(left, nearEndChecked.current)');
    expect(hook).toContain('void refreshDeadline().then((moved) => {');
    expect(hook).toContain('if (!moved) void submit("timeout");');
  });

  it('shares a read in flight, and carries on with the known deadline when the server cannot be reached', () => {
    expect(hook).toContain('if (!refreshing.current) {');
    expect(hook).toMatch(/catch \{\s+\/\/ no connection/);
  });

  it('ticks at once when the tab or window comes back, because a hidden tab may only run its timers once a minute', () => {
    expect(hook).toContain('document.addEventListener("visibilitychange", onVisible)');
    expect(hook).toContain('window.addEventListener("focus", tick)');
  });
});
