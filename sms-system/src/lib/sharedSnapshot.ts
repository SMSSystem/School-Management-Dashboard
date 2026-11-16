import {
  onSnapshot,
  queryEqual,
  refEqual,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';
import { auth } from './firebase';
import { createListenerRegistry, type Unsubscribe } from './sharedListener';
import { LISTENER_KEEP_OPEN_MS } from './queryPolicies';

// The pages' live lists (assignments, classes, exams, results, feedback, disciplinary actions, report cards, progress
// reports, houses, lesson notes, rubrics) subscribe here instead of calling onSnapshot, so a revisit inside the keep-open
// window reuses the listener that is already receiving changes. See sharedListener.ts for the rules.

const registry = createListenerRegistry({ keepOpenMs: LISTENER_KEEP_OPEN_MS });

const sameSubject = (a: unknown, b: unknown): boolean => {
  try {
    const x = a as Query | DocumentReference;
    const y = b as Query | DocumentReference;
    if (x.type === 'document' || y.type === 'document') {
      return x.type === y.type && refEqual(x as DocumentReference, y as DocumentReference);
    }
    return queryEqual(x as Query, y as Query);
  } catch {
    return false;
  }
};

/** The signed-in person's id, so a key can never be shared across accounts. */
const scope = () => auth.currentUser?.uid ?? 'signed-out';

/** Same arguments as onSnapshot(query, next, error) for a collection or query; `key` names what is listened to. */
export function subscribeSnapshot(
  key: string,
  source: Query,
  onNext: (snapshot: QuerySnapshot) => void,
  onError?: (error: unknown) => void,
): Unsubscribe;
export function subscribeSnapshot(
  key: string,
  source: DocumentReference,
  onNext: (snapshot: DocumentSnapshot) => void,
  onError?: (error: unknown) => void,
): Unsubscribe;
export function subscribeSnapshot(
  key: string,
  source: Query | DocumentReference,
  onNext: (snapshot: never) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return registry.subscribe<never>(
    `${scope()}|${key}`,
    source,
    sameSubject,
    (next, fail) =>
      onSnapshot(source as Query, next as (s: QuerySnapshot) => void, fail),
    onNext,
    onError,
  );
}

/** Closes every shared listener (called when the signed-in person changes). */
export function clearSharedListeners(): void {
  registry.clear();
}
