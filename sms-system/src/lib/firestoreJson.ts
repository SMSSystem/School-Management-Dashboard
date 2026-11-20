// Firestore Timestamps after a JSON round trip. Timestamp.toJSON() runs before any replacer, so stored data comes back
// as plain {type, seconds, nanoseconds} objects with no .toMillis(). Used by the query persister
// (lib/queryPersistence.ts) and the offline working copies (lib/offline/workingCopy.ts). Imports only the Timestamp
// class, not the Firebase app, so node tests can import it.

import { Timestamp } from "firebase/firestore";

const TIMESTAMP_JSON_TYPE = "firestore/timestamp/1.0";

function timestampOf(value: unknown): Timestamp | null {
  if (
    value === null ||
    typeof value !== "object" ||
    (value as { type?: unknown }).type !== TIMESTAMP_JSON_TYPE
  ) {
    return null;
  }
  const { seconds, nanoseconds } = value as {
    seconds: number;
    nanoseconds: number;
  };
  return new Timestamp(seconds, nanoseconds);
}

/** A JSON.parse reviver that rebuilds Timestamps. */
export function reviveFirestoreTimestamps(
  _key: string,
  value: unknown,
): unknown {
  return timestampOf(value) ?? value;
}

/** Rebuilds the Timestamps in a value that was already parsed. */
export function reviveTimestamps<T>(value: T): T {
  if (value instanceof Timestamp) return value;
  const timestamp = timestampOf(value);
  if (timestamp) return timestamp as T;
  if (Array.isArray(value)) return value.map(reviveTimestamps) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value))
      out[key] = reviveTimestamps(item);
    return out as T;
  }
  return value;
}
