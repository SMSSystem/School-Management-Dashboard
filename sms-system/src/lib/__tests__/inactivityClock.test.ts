import { describe, expect, it } from 'vitest';
import { WARNING_LEAD_MS, inactivityState } from '../inactivityClock';
import { noteActivity, onActivity } from '../activityBus';
import { KEEP_ALIVE_CAP_MS, KEEP_ALIVE_PING_MS, keepAliveStillCounts } from '../../hooks/useKeepAliveWhileOpen';
import { LEARNER_INACTIVITY_MS, STAFF_INACTIVITY_MS } from '../inactivityTimeout';
import hookRaw from '../../hooks/useInactivityLogout.ts?raw';
import protectedRaw from '../../components/Protected.tsx?raw';
import guardRaw from '../../components/InactivityGuard.tsx?raw';
import dashboardRaw from '../../scenes/(dashboard)/index.tsx?raw';
import viewerModalRaw from '../../components/reports/PdfViewerModal.tsx?raw';
import gridsheetModalRaw from '../../scenes/(dashboard)/attendance/gridsheet/GridsheetPDFModal.tsx?raw';

// The inactivity logout used to count with timers; a hidden tab's timers are throttled and a sleeping laptop's
// stop, so a session could outlive its five minutes. It now compares the clock with the last activity on a tick
// and on every wake-up (security report S-25, tightening plan F.10). The timeouts themselves are unchanged
// (inactivityTimeout.test.ts).

const lf = (s: string) => s.split('\r\n').join('\n');
const hook = lf(hookRaw);

describe('inactivityState', () => {
  const T = STAFF_INACTIVITY_MS;

  it('is active just after activity and until the warning window opens', () => {
    expect(inactivityState(1000, 1000, T).state).toBe('active');
    expect(inactivityState(0, T - WARNING_LEAD_MS - 1, T).state).toBe('active');
  });

  it('warns for the last ten seconds, counting them down', () => {
    expect(inactivityState(0, T - WARNING_LEAD_MS, T)).toEqual({ state: 'warning', secondsLeft: 10 });
    expect(inactivityState(0, T - 4_200, T)).toEqual({ state: 'warning', secondsLeft: 5 });
    expect(inactivityState(0, T - 1, T)).toEqual({ state: 'warning', secondsLeft: 1 });
  });

  it('expires at the timeout and stays expired however late it is looked at (a tab that slept)', () => {
    expect(inactivityState(0, T, T)).toEqual({ state: 'expired', secondsLeft: 0 });
    expect(inactivityState(0, T + 3_600_000, T).state).toBe('expired');
  });

  it('does not treat a clock set backwards as inactivity', () => {
    expect(inactivityState(10_000, 5_000, T).state).toBe('active');
  });

  it('applies to the learner window as well', () => {
    expect(inactivityState(0, LEARNER_INACTIVITY_MS - 1, LEARNER_INACTIVITY_MS).state).toBe('warning');
    expect(inactivityState(0, LEARNER_INACTIVITY_MS, LEARNER_INACTIVITY_MS).state).toBe('expired');
  });
});

describe('the activity bus', () => {
  it('calls every subscriber, and none after it unsubscribes', () => {
    const calls: string[] = [];
    const offA = onActivity(() => calls.push('a'));
    const offB = onActivity(() => calls.push('b'));
    noteActivity();
    offA();
    noteActivity();
    offB();
    noteActivity();
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});

describe('an open PDF viewer', () => {
  it('counts as activity for fifteen minutes, then the normal timeout resumes', () => {
    expect(KEEP_ALIVE_PING_MS).toBe(30_000);
    expect(KEEP_ALIVE_CAP_MS).toBe(15 * 60_000);
    expect(keepAliveStillCounts(0)).toBe(true);
    expect(keepAliveStillCounts(KEEP_ALIVE_CAP_MS - 1)).toBe(true);
    expect(keepAliveStillCounts(KEEP_ALIVE_CAP_MS)).toBe(false);
    // a ping every 30 s is well inside even the five-minute staff window
    expect(KEEP_ALIVE_PING_MS).toBeLessThan(STAFF_INACTIVITY_MS);
  });

  it('can be given a longer cap, as an exam in progress is', () => {
    const threeHours = 3 * 60 * 60_000;
    expect(keepAliveStillCounts(KEEP_ALIVE_CAP_MS, threeHours)).toBe(true);
    expect(keepAliveStillCounts(threeHours - 1, threeHours)).toBe(true);
    expect(keepAliveStillCounts(threeHours, threeHours)).toBe(false);
  });

  it('is reported by every component that shows a PDF viewer', () => {
    // the shared viewer (Report Card, Progress Report, Report Builder) and the Gridsheet's own
    for (const [name, src] of [
      ['PdfViewerModal', viewerModalRaw],
      ['GridsheetPDFModal', gridsheetModalRaw],
    ] as const) {
      expect(lf(src), name).toContain('useKeepAliveWhileOpen();');
    }
  });
});

describe('the hook', () => {
  it('remembers the last activity and judges it with the clock, not with timers', () => {
    expect(hook).toContain('let lastActivity = Date.now();');
    expect(hook).toContain('inactivityState(lastActivity, Date.now(), timeoutMs)');
    expect(hook).not.toContain('setTimeout(');
  });

  it('looks at the clock when the tab is shown, focused or restored, without counting that as activity', () => {
    expect(hook).toContain("document.addEventListener('visibilitychange', onVisibility);");
    expect(hook).toContain("const WAKE_EVENTS = ['focus', 'pageshow'] as const;");
    expect(hook).toContain("if (document.visibilityState === 'visible') void check();");
    expect(hook).toContain("const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'wheel', 'pointerdown', 'touchstart'] as const;");
    // wake events call check, not markActive
    expect(hook).toContain('WAKE_EVENTS.forEach((e) => window.addEventListener(e, onWake));');
  });

  it('listens to the activity bus and cleans everything up', () => {
    expect(hook).toContain('const stopListening = onActivity(markActive);');
    for (const cleanup of ['removeEventListener(e, markActive, ACTIVITY_OPTIONS)', 'removeEventListener(e, onWake)', "document.removeEventListener('visibilitychange', onVisibility)", 'stopListening();', 'clearInterval(tick);']) {
      expect(hook, cleanup).toContain(cleanup);
    }
  });

  it('signs out through signOut() and leaves for the login page, once', () => {
    expect(hook).toContain('signingOut = true;');
    expect(hook).toContain('await latest.current.signOut();');
    expect(hook).toContain("latest.current.navigate('/login', { replace: true });");
  });

  it('counts scrolling and pressing inside inner containers, by listening in the capture phase', () => {
    expect(hook).toContain('const ACTIVITY_OPTIONS = { passive: true, capture: true } as const;');
    expect(hook).toContain('window.addEventListener(e, markActive, ACTIVITY_OPTIONS)');
  });

  it('does not let activity revive a session that has already run out', () => {
    const markActive = hook.slice(hook.indexOf('const markActive = () => {'), hook.indexOf('const onVisibility'));
    expect(markActive).toContain("inactivityState(lastActivity, Date.now(), timeoutMs).state === 'expired'");
    expect(markActive.indexOf("state === 'expired'")).toBeLessThan(markActive.indexOf('lastActivity = Date.now();'));
    expect(markActive).toContain('void check();');
  });

  it('does not restart its timer when the provider re-renders, and retries a sign-out that failed', () => {
    // the effect depends on the role only; the functions it calls come from a ref that is refreshed after each render
    expect(hook).toContain('const latest = useRef({ signOut, navigate, showToast, updateToast, dismissToast });');
    expect(hook).toContain('  }, [role]);');
    expect(hook).not.toContain('[role, signOut');
    const failure = hook.slice(hook.indexOf('try {'), hook.indexOf('return;', hook.indexOf('catch (err)')));
    expect(failure).toContain('signingOut = false;');
  });

  it('is mounted on the dashboard and on the forced change-password page', () => {
    expect(lf(dashboardRaw)).toContain('useInactivityLogout();');
    expect(lf(guardRaw)).toContain('useInactivityLogout();');
    const gate = lf(protectedRaw);
    expect(gate).toMatch(/<InactivityGuard \/>\s*<ChangePasswordPage \/>/);
  });
});
