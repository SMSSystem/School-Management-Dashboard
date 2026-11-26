// The key that encrypts what a person's tab keeps on the device (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md).
// One random key per person, in an owner-only document (firestore.rules, users/{uid}/deviceKeys/outbox), read at
// sign-in and kept for the tab in sessionStorage: it survives a reload, so the tab works offline, and it goes when the
// tab closes or the person signs out. What's left on the device after that can't be read without signing in again.

import {
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  fromBase64,
  importKey,
  KEY_BYTES,
  newKeyBytes,
  toBase64,
} from "./offlineCrypto";
import { SESSION_KEY_STORAGE } from "./sessionKeyStorage";
import { readSessionJson, writeSessionJson } from "./tabStorage";

const keyDoc = (uid: string) => doc(db, "users", uid, "deviceKeys", "outbox");

function remember(uid: string, raw: string): void {
  // Without storage the key lasts until a reload: the store still works for this page.
  writeSessionJson(SESSION_KEY_STORAGE, { uid, key: raw });
}

function validRaw(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  try {
    return fromBase64(raw).length === KEY_BYTES;
  } catch {
    return false;
  }
}

/** This tab's key for this person, with no network: from sessionStorage, or null. */
export async function storedSessionKey(uid: string): Promise<CryptoKey | null> {
  const parsed = readSessionJson(SESSION_KEY_STORAGE) as {
    uid?: string;
    key?: unknown;
  } | null;
  if (!parsed || parsed.uid !== uid || !validRaw(parsed.key)) return null;
  try {
    return await importKey(fromBase64(parsed.key));
  } catch {
    return null;
  }
}

async function readRaw(uid: string): Promise<string | null> {
  const snap = await getDocFromServer(keyDoc(uid));
  const raw = snap.exists() ? snap.data().key : null;
  return validRaw(raw) ? raw : null;
}

/**
 * This person's key: from this tab if it has it, otherwise read from the server, or created there on first use.
 * Needs the network the first time in a tab. Returns null when it can't get one. Never throws.
 */
export async function establishSessionKey(
  uid: string,
): Promise<CryptoKey | null> {
  const stored = await storedSessionKey(uid);
  if (stored) return stored;
  try {
    let raw = await readRaw(uid);
    if (!raw) {
      const fresh = toBase64(newKeyBytes());
      try {
        // Create only: the rules refuse an update, so two devices racing here end up sharing the first key.
        await setDoc(keyDoc(uid), { key: fresh, createdAt: serverTimestamp() });
        raw = fresh;
      } catch {
        raw = await readRaw(uid);
      }
    }
    if (!raw) return null;
    remember(uid, raw);
    return await importKey(fromBase64(raw));
  } catch {
    return null;
  }
}
