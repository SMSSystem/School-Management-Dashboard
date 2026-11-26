// What the offline idle lock checks a password against (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice D).
// At password sign-in the tab keeps a one-way PBKDF2 hash of the password, never the password itself, in its own
// sessionStorage: it survives a reload, goes when the tab closes, and is deleted at sign-out. Without the network the
// lock screen can then tell the right password from a wrong one. No Firebase import, so the purge can forget it cheaply.

import { fromBase64, toBase64 } from "./offlineCrypto";
import {
  readSessionJson,
  removeSessionItem,
  writeSessionJson,
} from "./tabStorage";

export const UNLOCK_VERIFIER_STORAGE = "sms_unlock_verifier";

/** OWASP's current figure for PBKDF2-SHA-256. One check takes about 0.3 to 1.5 s, depending on the device. */
const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

let iterations = ITERATIONS;

/** Test seam: fewer iterations so the tests run fast, or null to go back to the real figure. */
export function setVerifierIterationsForTests(next: number | null): void {
  iterations = next ?? ITERATIONS;
}

type StoredVerifier = {
  v: 1;
  uid: string;
  salt: string;
  iterations: number;
  hash: string;
};

export type PasswordCheck = "ok" | "wrong" | "none";

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  rounds: number,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: rounds },
    material,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

/** Compares every byte, so how long it takes doesn't say where two hashes first differ. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const STRING_FIELDS = ["uid", "salt", "hash"] as const;

/** Whether a parsed record has the shape createVerifier writes. */
function isVerifier(value: unknown): value is StoredVerifier {
  const record = value as Partial<StoredVerifier> | null;
  if (!record || record.v !== 1) return false;
  if (!STRING_FIELDS.every((key) => typeof record[key] === "string"))
    return false;
  return typeof record.iterations === "number" && record.iterations >= 1;
}

function stored(): StoredVerifier | null {
  const parsed = readSessionJson(UNLOCK_VERIFIER_STORAGE);
  return isVerifier(parsed) ? parsed : null;
}

/** Keeps this tab's verifier for this person's password. Returns whether it was kept. Never throws. */
export async function createVerifier(
  uid: string,
  password: string,
): Promise<boolean> {
  try {
    const salt = crypto.getRandomValues(
      new Uint8Array(new ArrayBuffer(SALT_BYTES)),
    );
    const hash = await derive(password, salt, iterations);
    const record: StoredVerifier = {
      v: 1,
      uid,
      salt: toBase64(salt),
      iterations,
      hash: toBase64(hash),
    };
    return writeSessionJson(UNLOCK_VERIFIER_STORAGE, record);
  } catch {
    return false;
  }
}

/** Whether this tab has a verifier for this person, so the lock screen knows whether it can unlock offline. */
export function hasVerifier(uid: string): boolean {
  return stored()?.uid === uid;
}

/**
 * Checks a password against this tab's verifier: "ok", "wrong", or "none" when there is no verifier for this person
 * (signed in before slice D, or storage blocked). Never throws.
 */
export async function checkPassword(
  uid: string,
  password: string,
): Promise<PasswordCheck> {
  const record = stored();
  if (!record || record.uid !== uid) return "none";
  try {
    const hash = await derive(
      password,
      fromBase64(record.salt),
      record.iterations,
    );
    return sameBytes(hash, fromBase64(record.hash)) ? "ok" : "wrong";
  } catch {
    return "none";
  }
}

/** Deletes this tab's verifier. Called at sign-out. Never throws. */
export function forgetVerifier(): void {
  removeSessionItem(UNLOCK_VERIFIER_STORAGE);
}
