import { displayVersion } from './appVersion';
import { deviceOnline } from './connectionStatus';

// Tells the person using a page why something did not load, and keeps the detail in the console.
//
// Before this existed a refused Firestore listener left its page on "Loading..." for good and a
// refused getDocs left it empty, with nothing on screen: both student_parents bugs of 2026-10-16
// hid that way. A listener or a read now passes its failure to onLoadError (or reportError); the
// toast comes from whoever registers a notifier (ToastProvider does), so this file imports no
// React and no Firebase and tests can import it.

export type ErrorKind = 'permission' | 'index' | 'quota' | 'auth' | 'network' | 'unknown';

export type ReportOptions = {
  /** What was being loaded, in a few plain words: "classes", "linked parents". */
  what?: string;
  /** Log only, no toast: for a read that is expected to fail for some roles. */
  quiet?: boolean;
};

type ErrorLike = { code?: unknown; message?: unknown; name?: unknown };

const asLike = (err: unknown): ErrorLike => (typeof err === 'object' && err !== null ? (err as ErrorLike) : {});

/** 'permission-denied', 'PERMISSION_DENIED' (Realtime Database) and 'storage/unauthorized' read alike. */
export function errorCode(err: unknown): string {
  const code = asLike(err).code;
  return typeof code === 'string' ? code.toLowerCase().replace(/_/g, '-') : '';
}

const PERMISSION = new Set(['permission-denied', 'storage/unauthorized']);
const QUOTA = new Set(['resource-exhausted', 'storage/quota-exceeded']);
const AUTH = new Set([
  'unauthenticated',
  'storage/unauthenticated',
  'auth/user-token-expired',
  'auth/id-token-expired',
  'auth/id-token-revoked',
]);
const NETWORK = new Set(['unavailable', 'deadline-exceeded', 'auth/network-request-failed', 'storage/retry-limit-exceeded']);

export function classifyError(err: unknown): ErrorKind {
  const code = errorCode(err);
  if (PERMISSION.has(code)) return 'permission';
  if (QUOTA.has(code)) return 'quota';
  if (AUTH.has(code)) return 'auth';
  if (NETWORK.has(code)) return 'network';
  if (code === 'failed-precondition') {
    // Firestore's message for a missing composite index carries the console link that creates it.
    const message = asLike(err).message;
    return typeof message === 'string' && /index/i.test(message) ? 'index' : 'unknown';
  }
  return 'unknown';
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function describeError(kind: ErrorKind, what?: string): string {
  const subject = what?.trim() || 'this page';
  switch (kind) {
    case 'permission':
      return `You don't have access to ${subject}. If you think you should, tell your administrator.`;
    case 'index':
      return `${capitalize(subject)} can't be shown yet because the database needs an index. Tell your administrator.`;
    case 'quota':
      return `The service has reached its daily limit, so ${subject} can't be loaded. Try again later.`;
    case 'auth':
      return 'Your session has ended. Sign in again.';
    case 'network':
      return `Can't reach the server, so ${subject} didn't load. Check your connection.`;
    default:
      return `Something went wrong loading ${subject}. Try again.`;
  }
}

type Notifier = (message: string) => void;
let notifier: Notifier | null = null;

/** ToastProvider registers its toast here (and passes null when it unmounts). */
export function setErrorNotifier(next: Notifier | null): void {
  notifier = next;
}

// A page whose reads all fail would otherwise stack one toast per read.
export const REPEAT_WINDOW_MS = 10_000;
export const MAX_TOASTS_PER_WINDOW = 3;
const lastShown = new Map<string, number>();
let recent: number[] = [];

// The same error object is reported once. A cached read (queryClient.fetchQuery) is reported by the
// query cache and then rejects its caller with that same object; without this, a caller that has no
// handler would report it a second time through the unhandled-rejection listener.
let reported = new WeakSet<object>();

/** For tests: forget what was shown and drop the notifier. */
export function resetReporter(): void {
  lastShown.clear();
  recent = [];
  notifier = null;
  reported = new WeakSet<object>();
}

const isOffline = (): boolean => !deviceOnline();

/**
 * Logs a failed read and, unless it is `quiet`, tells the person. No toast when:
 *  - the failure is a lost connection while the app already knows it is offline (the banner says so);
 *  - the same kind of failure for the same thing was toasted in the last 10 s;
 *  - three toasts were shown in the last 10 s (the rest are logged only).
 */
export function reportError(err: unknown, options: ReportOptions = {}): void {
  const code = errorCode(err);
  // A listener torn down on navigation, not a failure.
  if (code === 'cancelled' || code === 'aborted') return;
  if (typeof err === 'object' && err !== null) {
    if (reported.has(err)) return;
    reported.add(err);
  }

  const what = options.what ?? 'data';
  if (options.quiet) {
    console.warn(`Could not load ${what} (${displayVersion()}):`, err);
    return;
  }
  console.error(`Could not load ${what} (${displayVersion()}):`, err);
  if (!notifier) return;

  const kind = classifyError(err);
  if (kind === 'network' && isOffline()) return;

  const now = Date.now();
  recent = recent.filter((t) => now - t < REPEAT_WINDOW_MS);
  for (const [seen, at] of lastShown) if (now - at >= REPEAT_WINDOW_MS) lastShown.delete(seen);
  const key = `${kind}|${options.what ?? ''}`;
  if (lastShown.has(key) || recent.length >= MAX_TOASTS_PER_WINDOW) return;
  lastShown.set(key, now);
  recent.push(now);
  notifier(describeError(kind, options.what));
}

/**
 * The handler for a listener's third argument or a read's rejection:
 *   onSnapshot(q, next, onLoadError("classes", () => setLoading(false)))
 *   getDocs(q).then(ok, onLoadError("classes", () => setLoading(false)))
 * `onFail` is where the page stops waiting (clear its loading flag).
 */
export function onLoadError(what: string, onFail?: () => void, options: { quiet?: boolean } = {}): (err: unknown) => void {
  return (err) => {
    reportError(err, { what, quiet: options.quiet });
    onFail?.();
  };
}

// What a cached query's first key segment is called on screen.
const QUERY_WORDS: Record<string, string> = {
  academicYears: 'academic years',
  terms: 'terms',
  nonSchoolDays: 'non-school days',
  users: 'people',
  classStudents: "the class's students",
  subjects: 'subjects',
  houses: 'houses',
  departments: 'departments',
  classes: 'classes',
  class: 'the class',
  linkedChildren: 'your children',
  auditLog: 'the audit log',
  profileActivity: 'your activity',
  profilePerformed: 'the actions you performed',
  profileAudit: 'the audit and security events',
  academicYear: 'the academic year',
  nextClassSlots: 'the timetable',
  gradeEntryTracking: 'grade entry tracking',
  dashboardCounts: 'the dashboard numbers',
  classPopulation: 'class sizes',
};

export function whatForQuery(queryKey: readonly unknown[]): string {
  const root = queryKey[0];
  return (typeof root === 'string' && QUERY_WORDS[root]) || 'data';
}

// Firebase's own error codes ('permission-denied', 'unavailable', 'auth/...', 'storage/...').
const FIREBASE_CODE =
  /^(auth|storage|functions|app-check|database)\/|^(cancelled|unknown|invalid-argument|deadline-exceeded|not-found|already-exists|permission-denied|resource-exhausted|failed-precondition|aborted|out-of-range|unimplemented|internal|unavailable|data-loss|unauthenticated)$/;

export function isFirebaseError(err: unknown): boolean {
  const code = errorCode(err);
  return (code !== '' && FIREBASE_CODE.test(code)) || asLike(err).name === 'FirebaseError';
}

/**
 * The safety net behind the per-site handlers: a Firebase error that nothing caught (a rejected
 * promise, or the error the SDK throws for a listener that has no error callback) is reported
 * like any other failed read. Other errors are left to the browser (a page's chunk failing to
 * load belongs to chunkReload.ts). Returns a function that removes the listeners.
 */
export function installErrorReporting(target: EventTarget = window): () => void {
  const onRejection = (event: Event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    if (isFirebaseError(reason)) reportError(reason);
  };
  const onError = (event: Event) => {
    const error = (event as ErrorEvent).error;
    if (isFirebaseError(error)) reportError(error);
  };
  target.addEventListener('unhandledrejection', onRejection);
  target.addEventListener('error', onError);
  return () => {
    target.removeEventListener('unhandledrejection', onRejection);
    target.removeEventListener('error', onError);
  };
}
