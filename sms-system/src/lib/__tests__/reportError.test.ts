import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_TOASTS_PER_WINDOW,
  REPEAT_WINDOW_MS,
  classifyError,
  describeError,
  errorCode,
  installErrorReporting,
  isFirebaseError,
  onLoadError,
  reportError,
  resetReporter,
  setErrorNotifier,
  whatForQuery,
} from '../reportError';
import { setOffline, setOnline } from '../connectionStatus';
import { queryClient } from '../queryClient';
import mainRaw from '../../main.tsx?raw';
import toastRaw from '../ToastContext.tsx?raw';
import queryClientRaw from '../queryClient.ts?raw';

// A failed read used to be invisible: the page kept its spinner or showed an empty list. These pin
// how a failure is classified, what the person is told, when a toast is held back, and where the
// reporter is plugged in.

const norm = (s: string) => s.split('\r\n').join('\n');
const fbError = (code: string, message = 'x') => Object.assign(new Error(message), { code, name: 'FirebaseError' });

describe('errorCode and classifyError', () => {
  it('reads Firestore, Realtime Database, Storage and Auth codes alike', () => {
    expect(errorCode(fbError('permission-denied'))).toBe('permission-denied');
    expect(errorCode({ code: 'PERMISSION_DENIED' })).toBe('permission-denied');
    expect(errorCode({ code: 'storage/unauthorized' })).toBe('storage/unauthorized');
    for (const v of [null, undefined, 'permission-denied', 5, {}, new Error('no code')]) {
      expect(errorCode(v), String(v)).toBe('');
    }
  });

  it('sorts failures into the kinds the person is told about', () => {
    const table: [unknown, string][] = [
      [fbError('permission-denied'), 'permission'],
      [{ code: 'PERMISSION_DENIED' }, 'permission'],
      [fbError('storage/unauthorized'), 'permission'],
      [fbError('resource-exhausted'), 'quota'],
      [fbError('unauthenticated'), 'auth'],
      [fbError('auth/id-token-expired'), 'auth'],
      [fbError('unavailable'), 'network'],
      [fbError('deadline-exceeded'), 'network'],
      [fbError('auth/network-request-failed'), 'network'],
      [fbError('failed-precondition', 'The query requires an index. You can create it here: https://console.firebase.google.com/x'), 'index'],
      [fbError('failed-precondition', 'Document already changed'), 'unknown'],
      [fbError('invalid-argument'), 'unknown'],
      [new Error('plain'), 'unknown'],
      [undefined, 'unknown'],
    ];
    for (const [err, kind] of table) expect(classifyError(err), String(err)).toBe(kind);
  });
});

describe('describeError', () => {
  it('names what failed in plain words, and says who can fix it', () => {
    expect(describeError('permission', 'classes')).toBe(
      "You don't have access to classes. If you think you should, tell your administrator.",
    );
    expect(describeError('index', 'linked parents')).toBe(
      "Linked parents can't be shown yet because the database needs an index. Tell your administrator.",
    );
    expect(describeError('quota', 'assignments')).toBe(
      "The service has reached its daily limit, so assignments can't be loaded. Try again later.",
    );
    expect(describeError('auth', 'classes')).toBe('Your session has ended. Sign in again.');
    expect(describeError('network', 'classes')).toBe("Can't reach the server, so classes didn't load. Check your connection.");
    expect(describeError('unknown', 'classes')).toBe('Something went wrong loading classes. Try again.');
  });

  it('says "this page" when nothing names the thing', () => {
    expect(describeError('unknown')).toBe('Something went wrong loading this page. Try again.');
    expect(describeError('permission', '  ')).toBe(
      "You don't have access to this page. If you think you should, tell your administrator.",
    );
  });
});

describe('reportError', () => {
  const shown: string[] = [];
  let logError: ReturnType<typeof vi.spyOn>;
  let logWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
    resetReporter();
    setOnline();
    shown.length = 0;
    setErrorNotifier((m) => shown.push(m));
    logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    logWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetReporter();
    setOnline();
  });

  it('logs the full error and shows one toast', () => {
    const err = fbError('permission-denied');
    reportError(err, { what: 'classes' });
    expect(logError).toHaveBeenCalledWith('Could not load classes:', err);
    expect(shown).toEqual(["You don't have access to classes. If you think you should, tell your administrator."]);
  });

  it('reports one error object once, however many handlers see it', () => {
    // A cached read (queryClient.fetchQuery) is reported by the query cache and then rejects its
    // caller with that same object: the caller's own handler, or the unhandled-rejection listener,
    // must not report it a second time.
    const err = fbError('permission-denied');
    reportError(err, { what: 'classes' });
    reportError(err);
    onLoadError('classes')(err);
    expect(shown).toHaveLength(1);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('only logs (as a warning) when quiet, for a read that is expected to fail for some roles', () => {
    reportError(fbError('permission-denied'), { what: 'the rubric', quiet: true });
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
    expect(shown).toEqual([]);
  });

  it('only logs when nothing has registered a notifier', () => {
    setErrorNotifier(null);
    reportError(fbError('unavailable'), { what: 'classes' });
    expect(logError).toHaveBeenCalledTimes(1);
    expect(shown).toEqual([]);
  });

  it('ignores a listener that was torn down (cancelled, aborted): not a failure', () => {
    reportError(fbError('cancelled'), { what: 'classes' });
    reportError(fbError('aborted'), { what: 'classes' });
    expect(logError).not.toHaveBeenCalled();
    expect(shown).toEqual([]);
  });

  it('shows the same failure for the same thing once per window, and again after it', () => {
    reportError(fbError('permission-denied'), { what: 'classes' });
    reportError(fbError('permission-denied'), { what: 'classes' });
    expect(shown).toHaveLength(1);
    vi.advanceTimersByTime(REPEAT_WINDOW_MS);
    reportError(fbError('permission-denied'), { what: 'classes' });
    expect(shown).toHaveLength(2);
    expect(logError).toHaveBeenCalledTimes(3); // every failure is still logged
  });

  it('treats a different thing, or a different kind of failure, as a separate toast', () => {
    reportError(fbError('permission-denied'), { what: 'classes' });
    reportError(fbError('permission-denied'), { what: 'subjects' });
    reportError(fbError('resource-exhausted'), { what: 'classes' });
    expect(shown).toHaveLength(3);
  });

  it('shows at most three toasts per window, however many reads fail', () => {
    expect(MAX_TOASTS_PER_WINDOW).toBe(3);
    for (const what of ['a', 'b', 'c', 'd', 'e']) reportError(fbError('permission-denied'), { what });
    expect(shown).toHaveLength(3);
    expect(logError).toHaveBeenCalledTimes(5);
    vi.advanceTimersByTime(REPEAT_WINDOW_MS);
    reportError(fbError('permission-denied'), { what: 'd' });
    expect(shown).toHaveLength(4);
  });

  it('holds back a lost-connection toast while the app already knows it is offline', () => {
    setOffline();
    reportError(fbError('unavailable'), { what: 'classes' });
    expect(shown).toEqual([]);
    reportError(fbError('permission-denied'), { what: 'classes' }); // other failures still show
    expect(shown).toHaveLength(1);
    setOnline();
    reportError(fbError('unavailable'), { what: 'subjects' });
    expect(shown).toEqual([
      "You don't have access to classes. If you think you should, tell your administrator.",
      "Can't reach the server, so subjects didn't load. Check your connection.",
    ]);
  });

  it('also holds it back when the browser says it is offline', () => {
    vi.stubGlobal('navigator', { onLine: false });
    reportError(fbError('unavailable'), { what: 'classes' });
    expect(shown).toEqual([]);
  });
});

describe('onLoadError', () => {
  beforeEach(() => {
    resetReporter();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetReporter();
  });

  it('reports the failure, then lets the page stop waiting', () => {
    const shown: string[] = [];
    setErrorNotifier((m) => shown.push(m));
    const stop = vi.fn();
    onLoadError('classes', stop)(fbError('permission-denied'));
    expect(shown).toHaveLength(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('works without a page-side callback, and passes quiet through', () => {
    const shown: string[] = [];
    setErrorNotifier((m) => shown.push(m));
    expect(() => onLoadError('classes')(fbError('unavailable'))).not.toThrow();
    const stop = vi.fn();
    onLoadError('the rubric', stop, { quiet: true })(fbError('permission-denied'));
    expect(shown).toHaveLength(1); // only the first one toasted
    expect(stop).toHaveBeenCalledTimes(1); // the quiet one still lets the page stop waiting
  });
});

describe('whatForQuery', () => {
  it('turns a cached query key into words, and falls back to "data"', () => {
    expect(whatForQuery(['terms', 'inst1'])).toBe('terms');
    expect(whatForQuery(['users', 'inst1'])).toBe('people');
    expect(whatForQuery(['classStudents', 'inst1'])).toBe("the class's students");
    expect(whatForQuery(['auditLog', 'super_admin', '__all__', 'all'])).toBe('the audit log');
    expect(whatForQuery(['profileActivity', 'uid1', 0])).toBe('your activity');
    expect(whatForQuery(['somethingNew'])).toBe('data');
    expect(whatForQuery([])).toBe('data');
    expect(whatForQuery([5])).toBe('data');
  });
});

describe('the safety net for errors nobody caught', () => {
  const shown: string[] = [];
  beforeEach(() => {
    resetReporter();
    shown.length = 0;
    setErrorNotifier((m) => shown.push(m));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetReporter();
  });

  it('recognises Firebase errors by their code or name, and nothing else', () => {
    expect(isFirebaseError(fbError('permission-denied'))).toBe(true);
    expect(isFirebaseError({ code: 'auth/too-many-requests' })).toBe(true);
    expect(isFirebaseError({ code: 'PERMISSION_DENIED' })).toBe(true);
    expect(isFirebaseError({ name: 'FirebaseError' })).toBe(true);
    for (const v of [new Error('boom'), new TypeError('x'), { code: 'ENOENT' }, 'permission-denied', null, undefined]) {
      expect(isFirebaseError(v), String(v)).toBe(false);
    }
  });

  it('reports a Firebase error from an unhandled rejection and from an uncaught throw', () => {
    const target = new EventTarget();
    const uninstall = installErrorReporting(target);
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: fbError('permission-denied') }));
    target.dispatchEvent(Object.assign(new Event('error'), { error: fbError('resource-exhausted') }));
    expect(shown).toEqual([
      "You don't have access to this page. If you think you should, tell your administrator.",
      "The service has reached its daily limit, so this page can't be loaded. Try again later.",
    ]);
    uninstall();
  });

  it('leaves every other error to the browser, and stops listening once uninstalled', () => {
    const target = new EventTarget();
    const uninstall = installErrorReporting(target);
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('chunk failed') }));
    target.dispatchEvent(Object.assign(new Event('error'), { error: new TypeError('x is undefined') }));
    expect(shown).toEqual([]);
    uninstall();
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: fbError('permission-denied') }));
    expect(shown).toEqual([]);
  });
});

describe('wiring', () => {
  it('reports a cached query that still fails after its retry, named by its key', async () => {
    resetReporter();
    setOnline();
    const shown: string[] = [];
    setErrorNotifier((m) => shown.push(m));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    queryClient.clear();
    await expect(
      queryClient.fetchQuery({
        queryKey: ['terms', 'inst1'],
        queryFn: () => Promise.reject(fbError('permission-denied')),
        retry: false,
      }),
    ).rejects.toThrow();
    expect(shown).toEqual(["You don't have access to terms. If you think you should, tell your administrator."]);
    queryClient.clear();
    vi.restoreAllMocks();
    resetReporter();
  });

  it('plugs into the query cache, the toast provider and the app start', () => {
    const queryClientSource = norm(queryClientRaw);
    expect(queryClientSource).toContain('queryCache: new QueryCache({');
    expect(queryClientSource).toContain('reportError(error, { what: whatForQuery(query.queryKey) })');

    const toast = norm(toastRaw);
    expect(toast).toContain('setErrorNotifier((message) => {');
    expect(toast).toContain('return () => setErrorNotifier(null);');

    const main = norm(mainRaw);
    expect(main).toContain('installErrorReporting();');
    expect(main.indexOf('installChunkReloadGuard();')).toBeLessThan(main.indexOf('installErrorReporting();'));
  });
});
