// One live listener per query, shared by every page that asks for it, and kept open for a while after the last page
// leaves. Before this, each page opened its own onSnapshot on mount and closed it on unmount, so every visit read the
// whole collection again (a listener bills its first snapshot in full). Now a revisit inside the keep-open window
// gets the last snapshot at once, and the listener has been receiving changes all along, so lists still update live.
//
// Pure (no Firebase import) so it can be tested with plain functions and fake timers. sharedSnapshot.ts is the thin
// Firestore wrapper; AuthContext closes everything at sign-in and sign-out, and each key is prefixed there with the
// signed-in user's id, so one person's listener can never serve another.

export type Unsubscribe = () => void;
type Open<T> = (next: (value: T) => void, fail: (error: unknown) => void) => Unsubscribe;
type Subscriber = { onNext: (value: never) => void; onError?: (error: unknown) => void };

type Entry = {
  subject: unknown;
  subscribers: Set<Subscriber>;
  hasValue: boolean;
  value: unknown;
  unsubscribe: Unsubscribe;
  timer: ReturnType<typeof setTimeout> | null;
  registered: boolean;
};

export function createListenerRegistry({ keepOpenMs }: { keepOpenMs: number }) {
  const entries = new Map<string, Entry>();

  function drop(key: string, entry: Entry) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    if (entries.get(key) === entry) entries.delete(key);
    entry.registered = false;
    try {
      entry.unsubscribe();
    } catch {
      // closing a listener must never throw into the page that is leaving
    }
  }

  /**
   * Subscribes `onNext` to the listener for `key`, opening it with `open` if no one else has. `subject` says what the
   * key listens to (a Firestore query), and `same` compares two subjects: a key asked for with a different subject
   * than the one already open gets a private, unshared listener, so a wrong key can cost reads but never show
   * another query's data.
   */
  function subscribe<T>(
    key: string,
    subject: unknown,
    same: (a: unknown, b: unknown) => boolean,
    open: Open<T>,
    onNext: (value: T) => void,
    onError?: (error: unknown) => void,
  ): Unsubscribe {
    const subscriber: Subscriber = { onNext: onNext as (value: never) => void, onError };
    let entry = entries.get(key);
    const shared = !entry || same(entry.subject, subject);

    if (entry && shared) {
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
      entry.subscribers.add(subscriber);
      if (entry.hasValue) onNext(entry.value as T);
    } else {
      const fresh: Entry = {
        subject,
        subscribers: new Set([subscriber]),
        hasValue: false,
        value: undefined,
        unsubscribe: () => undefined,
        timer: null,
        registered: !entry,
      };
      entry = fresh;
      if (fresh.registered) entries.set(key, fresh);
      fresh.unsubscribe = open(
        (value) => {
          fresh.hasValue = true;
          fresh.value = value;
          for (const s of [...fresh.subscribers]) (s.onNext as (v: T) => void)(value);
        },
        (error) => {
          const waiting = [...fresh.subscribers];
          // A listener that failed is finished (Firestore ends it): forget it, so the next visit opens a new one.
          drop(key, fresh);
          for (const s of waiting) s.onError?.(error);
        },
      );
    }

    const current = entry;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      current.subscribers.delete(subscriber);
      if (current.subscribers.size > 0) return;
      if (!current.registered) {
        drop(key, current); // a private listener ends with its only subscriber
        return;
      }
      current.timer = setTimeout(() => drop(key, current), keepOpenMs);
    };
  }

  /** Closes every listener and forgets every snapshot (sign-in, sign-out). */
  function clear() {
    for (const [key, entry] of [...entries]) {
      entry.subscribers.clear();
      drop(key, entry);
    }
    entries.clear();
  }

  return { subscribe, clear, size: () => entries.size };
}
