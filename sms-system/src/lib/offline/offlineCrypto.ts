// Encryption for what the app keeps on the device (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md). AES-GCM with
// a fresh random IV for every record, and the record's id bound in as additional data, so a record can't be moved to
// another id. The key itself never goes into IndexedDB: see sessionKey.ts.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type Sealed = { iv: string; data: string };

export const KEY_BYTES = 32;
const IV_BYTES = 12;

export function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const text8 = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(text8.length));
  for (let i = 0; i < text8.length; i++) bytes[i] = text8.charCodeAt(i);
  return bytes;
}

/** 32 random bytes for a new key. */
export function newKeyBytes(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(KEY_BYTES)));
}

/** A key the page can use but not export again. */
export function importKey(bytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function seal(
  key: CryptoKey,
  id: string,
  value: unknown,
): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(id) },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

/** The value, or undefined when the key, the id or the record doesn't match. */
export async function unseal<T>(
  key: CryptoKey,
  id: string,
  sealed: Sealed,
): Promise<T | undefined> {
  try {
    const data = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(sealed.iv),
        additionalData: encoder.encode(id),
      },
      key,
      fromBase64(sealed.data),
    );
    return JSON.parse(decoder.decode(data)) as T;
  } catch {
    return undefined;
  }
}

/** A short, one-way tag for a value, so ids on disk don't show what they are. */
export async function tagOf(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64(new Uint8Array(digest)).slice(0, 22);
}
