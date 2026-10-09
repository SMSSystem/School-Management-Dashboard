import { readFileSync } from 'node:fs';
import process from 'node:process';
import { cert } from 'firebase-admin/app';
import { getDatabaseWithUrl } from 'firebase-admin/database';
import { HAS_ADMIN_SDK, institutionId } from './lesson-notes-support';

// Support code for e2e/17-large-attachments.spec.ts: ground truth for the
// Realtime Database (LARGE_ATTACHMENTS_RTDB_SPEC.md), through the Admin SDK so it
// bypasses the rules. Deliberately imports only firebase-admin/app and
// firebase-admin/database (never firebase-admin/auth: see lesson-notes-support.ts).
//
// The QA institution lives inside the production Firebase project, so the files
// and the byte counters this touches are production data. Everything a spec
// writes is removed again, and the counters are put back to the baseline taken
// before the run.

const SERVICE_ACCOUNT_PATH = 'scripts/service-account.json';

export const RTDB_URL = process.env.VITE_FIREBASE_DATABASE_URL?.replace(/\/$/, '');
export const HAS_RTDB = HAS_ADMIN_SDK && !!RTDB_URL;
export const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;

let cachedDb: ReturnType<typeof getDatabaseWithUrl> | null = null;
export function rtdb() {
  if (!HAS_RTDB) throw new Error('scripts/service-account.json and VITE_FIREBASE_DATABASE_URL (.env) are required');
  cachedDb ??= getDatabaseWithUrl(RTDB_URL!);
  return cachedDb;
}

// ── Reads (never downloads a file body) ─────────────────────────────────────

/** The keys under files/{institutionId}, from a REST "shallow" read: no values are downloaded. */
export async function listBlobKeys(iid: string): Promise<string[]> {
  const credential = cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8')));
  const token = (await credential.getAccessToken()).access_token;
  const res = await fetch(`${RTDB_URL}/files/${iid}.json?shallow=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Realtime Database files/${iid}: HTTP ${res.status}`);
  const body = (await res.json()) as Record<string, unknown> | null;
  return body ? Object.keys(body).sort() : [];
}

export type BlobMeta = { size: number; mimeType: string; uploadedAt: number; uploadedBy: string };

/** A file's metadata (never its body), or null when it does not exist. */
export async function blobMeta(iid: string, key: string): Promise<BlobMeta | null> {
  const field = async (name: string) => (await rtdb().ref(`files/${iid}/${key}/${name}`).get()).val();
  const size = await field('size');
  if (size === null) return null;
  const [mimeType, uploadedAt, uploadedBy] = await Promise.all([field('mimeType'), field('uploadedAt'), field('uploadedBy')]);
  return { size, mimeType, uploadedAt, uploadedBy };
}

export const blobExists = async (iid: string, key: string): Promise<boolean> => (await blobMeta(iid, key)) !== null;

export type Counters = { institution: number; total: number };

export async function counters(iid: string): Promise<Counters> {
  const [institution, total] = await Promise.all([
    rtdb().ref(`usage/institutions/${iid}/bytes`).get(),
    rtdb().ref('usage/total/bytes').get(),
  ]);
  return { institution: Number(institution.val() ?? 0), total: Number(total.val() ?? 0) };
}

/** Puts the counters back to a baseline if a run left them different (and says so). */
export async function restoreCounters(iid: string, baseline: Counters): Promise<void> {
  const now = await counters(iid);
  if (now.institution === baseline.institution && now.total === baseline.total) return;
  console.warn(`Counters differed from the baseline after the run (institution ${now.institution} vs ${baseline.institution}, total ${now.total} vs ${baseline.total}); restoring.`);
  await rtdb().ref().update({
    [`usage/institutions/${iid}/bytes`]: baseline.institution,
    'usage/total/bytes': baseline.total,
  });
}

// ── Writes (seeding and cleanup) ────────────────────────────────────────────

const TINY_PDF_DATA_URL = 'data:application/pdf;base64,JVBERi0xLjQgcWEgZml4dHVyZQ=='; // "%PDF-1.4 qa fixture"

/**
 * Stores a small real file directly, with a chosen age and the byte counters
 * raised by `size`, exactly as the app's own upload would. `size` is the size
 * recorded and counted, so a seeded file can stand in for a large one.
 */
export async function seedBlob(iid: string, opts: { ageDays: number; size: number; key?: string }): Promise<string> {
  const key = opts.key ?? crypto.randomUUID();
  const now = await counters(iid);
  await rtdb().ref().update({
    [`files/${iid}/${key}`]: {
      dataUrl: TINY_PDF_DATA_URL,
      size: opts.size,
      mimeType: 'application/pdf',
      uploadedAt: Date.now() - opts.ageDays * 86_400_000,
      uploadedBy: 'e2e-seed',
    },
    [`usage/institutions/${iid}/bytes`]: now.institution + opts.size,
    'usage/total/bytes': now.total + opts.size,
  });
  return key;
}

/** Removes a file and lowers both counters by its size, like the app's own delete. No-op if it is gone. */
export async function removeBlob(iid: string, key: string): Promise<void> {
  const meta = await blobMeta(iid, key);
  if (!meta) return;
  const now = await counters(iid);
  await rtdb().ref().update({
    [`files/${iid}/${key}`]: null,
    [`usage/institutions/${iid}/bytes`]: Math.max(0, now.institution - meta.size),
    'usage/total/bytes': Math.max(0, now.total - meta.size),
  });
}

/** Removes every file under files/{iid} that is not in `keep`, and returns how many it removed. */
export async function removeBlobsExcept(iid: string, keep: Set<string>): Promise<number> {
  let removed = 0;
  for (const key of await listBlobKeys(iid)) {
    if (keep.has(key)) continue;
    await removeBlob(iid, key);
    removed++;
  }
  return removed;
}

export { institutionId };

// ── Fixture files ───────────────────────────────────────────────────────────

/** A PDF-shaped buffer of exactly `size` bytes, so the app's signature check accepts it. */
export function pdfBuffer(size: number): Buffer {
  const buf = Buffer.alloc(size, 0x41);
  buf.write('%PDF-1.4\n', 0, 'latin1');
  return buf;
}
