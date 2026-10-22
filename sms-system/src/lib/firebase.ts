import { getApp, getApps, initializeApp, onLog } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { browserSessionPersistence, getAuth, inMemoryPersistence, initializeAuth } from 'firebase/auth';
import { isFirestoreOfflineLog, setOffline } from './connectionStatus';
import { initializeFirestore, memoryLocalCache, memoryLruGarbageCollector, Timestamp } from 'firebase/firestore';

export { Timestamp };

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

export const app = initializeApp(firebaseConfig);

// Local/CI escape hatch — must run before initializeAppCheck. Only ever set
// in dev; a production build never defines VITE_FIREBASE_APPCHECK_DEBUG_TOKEN,
// so this branch is inert in production.
//
// Two modes, both driven by the same env var:
//   - VITE_FIREBASE_APPCHECK_DEBUG_TOKEN="true"        -> bootstrap mode: asks
//     the SDK to generate a fresh debug token and log it to the console. Use
//     this once to discover a token, then register it in Firebase Console ->
//     App Check -> Manage debug tokens.
//   - VITE_FIREBASE_APPCHECK_DEBUG_TOKEN="<real token>" -> pins that exact,
//     already-registered token instead of generating a new one each run.
// A literal "true" must map to the boolean true, not the string "true" —
// Firebase treats a string value as a token to use as-is, so passing the
// word "true" (or any other non-token placeholder) as a string gets rejected
// by the server with 403, not treated as a request to generate one.
if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN) {
  const debugTokenSetting = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN as string;
  (self as typeof self & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
    debugTokenSetting === 'true' ? true : debugTokenSetting;
}

// Guarded: without a configured site key, initializeAppCheck throws. This
// lets a developer without App Check env vars set up keep running the app
// locally against a project with enforcement still off — enforcement should
// only flip on in the Console once every environment that talks to this
// project has a working App Check configuration.
if (import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY as string),
    isTokenAutoRefreshEnabled: true,
  });
}

// Sign-in lives in the tab's sessionStorage (browserSessionPersistence): closing
// the tab ends the session, a reload keeps it, and each tab signs in on its own.
// The default (IndexedDB) persistence would keep a user signed in after the tab or
// the browser is closed. initializeAuth throws if this app's Auth was already
// created (Vite HMR re-evaluates this module), so fall back to the existing one.
function createAuth() {
  try {
    return initializeAuth(app, { persistence: browserSessionPersistence });
  } catch {
    return getAuth(app);
  }
}
export const auth = createAuth();

// The throw-away Auth instance used to create other people's accounts without
// disturbing the signed-in admin (AdminCreateUserForm, the student import). It
// holds no session worth keeping, so it lives in memory only: the default
// persistence would write the created user's token to IndexedDB
// (`firebaseLocalStorageDb`) on a shared browser. Both callers share the one
// "user-creation" app; initializeAuth throws if it already exists.
export function getUserCreationAuth() {
  const appName = 'user-creation';
  const secondaryApp = getApps().some((a) => a.name === appName)
    ? getApp(appName)
    : initializeApp(firebaseConfig, appName);
  try {
    return initializeAuth(secondaryApp, { persistence: inMemoryPersistence });
  } catch {
    return getAuth(secondaryApp);
  }
}

// One-active-session lock (src/lib/sessionLock.ts). Needs a Realtime Database
// (its onDisconnect releases the lock the moment a tab closes) AND an explicit
// opt-in flag, so dev, e2e and any environment without the database behave
// exactly as before. Production sets both in the Vercel environment.
export const databaseUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined;
export const SINGLE_SESSION_ENABLED =
  import.meta.env.VITE_SINGLE_SESSION_ENABLED === 'true' && !!databaseUrl;
// In-memory cache only — NOT persistentLocalCache. The persistent cache wrote
// every document the signed-in user read (student DOBs, ID numbers, phones,
// results…) to IndexedDB, unencrypted and never cleared, so it outlived sign-out,
// tab close and a change of user on a shared computer. Memory is gone with the
// page, and sign-out reloads the page (sessionPurge.ts).
//
// The LRU collector (not the default eager one) keeps query results and resume
// tokens for the session, so re-attaching a listener — navigating away and back —
// is still billed as a delta rather than a full re-read (see
// docs/miscellaneous-specs/FIRESTORE_READ_CACHING_SPEC.md §1.2). A page reload
// starts cold; reference data survives it through the allow-listed
// sessionStorage persister in queryPersistence.ts. The previous IndexedDB database
// is removed once per browser by legacyFirestoreCache.ts.
export const FIRESTORE_MEMORY_CACHE_BYTES = 40 * 1024 * 1024;
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: memoryLocalCache({
    garbageCollector: memoryLruGarbageCollector({ cacheSizeBytes: FIRESTORE_MEMORY_CACHE_BYTES }),
  }),
});

// The SDK logs "Could not reach Cloud Firestore backend…" at error level when it cannot
// connect; show the connection banner (components/ConnectionBanner.tsx). The default
// console output is unchanged. Registered once, here, where Firestore is created.
onLog(
  (log) => {
    if (isFirestoreOfflineLog(log.message)) setOffline();
  },
  { level: 'error' },
);

// The document types and their labels live in src/types, split by area. They are re-exported here so
// every `import { ... } from '@/lib/firebase'` keeps working.
export * from '@/types/people';
export * from '@/types/institution';
export * from '@/types/assessment';
export * from '@/types/exams';
export * from '@/types/lessonNotes';
export * from '@/types/attendance';
export * from '@/types/reports';
export * from '@/types/registration';
export * from '@/types/audit';
