import type { Database } from 'firebase/database';
import { app, databaseUrl, type Role } from './firebase';
import type { LargeUploadPolicy, ProcessedDocument } from './documentUpload';
import { needsBlobStore } from './documentUpload';
import {
  BLOB_UPLOAD_TIMEOUT_MS,
  BLOB_USAGE_READ_TIMEOUT_MS,
  TOTAL_USAGE_PATH,
  blobPath,
  budgetMessage,
  budgetWarningMessage,
  buildDeleteUpdate,
  buildPutUpdate,
  checkBudget,
  institutionUsagePath,
  isPermissionDenied,
  newBlobKey,
  policyFor,
  type Usage,
} from './blobStoreLogic';

// Large lesson-note and assignment files (over 500KB, up to 5MB) are kept in the
// Realtime Database at /files/{institutionId}/{key}; Firestore holds only the
// key (docs/miscellaneous-specs/LARGE_ATTACHMENTS_RTDB_SPEC.md). This is the thin
// wrapper around the SDK; the paths, budgets and updates are in blobStoreLogic.ts.
//
// Rules for using it:
//  - read a file by its exact path with get(). NEVER attach a listener to /files
//    or an institution's folder (it would download every file), and never put a
//    file through React Query (its cache is persisted to sessionStorage, ~5MB).
//  - upload before writing the Firestore record that points at it, so a record
//    never refers to a missing file. If the Firestore write then fails, call
//    deleteBlob; an orphan left behind is removed by the owner-run sweep script.
//
// Unlike the session lock this FAILS CLOSED: an unreachable database is an error
// the user sees, never a silent skip.

type Rtdb = typeof import('firebase/database');

export class BlobStoreError extends Error {}
/** A budget is full, so the file was refused before anything was written. */
export class BlobBudgetError extends BlobStoreError {}

const MAX_PUT_ATTEMPTS = 3;

/** Which upload limit applies to this role in this build (see policyFor). */
export const largeUploadPolicy = (role: Role | null | undefined): LargeUploadPolicy =>
  policyFor(role, !!databaseUrl);

async function load(): Promise<{ mod: Rtdb; database: Database }> {
  if (!databaseUrl) {
    throw new BlobStoreError(
      'The Realtime Database is not set up in this environment (VITE_FIREBASE_DATABASE_URL).',
    );
  }
  // Loaded on demand so the (sizeable) database SDK stays out of the main bundle.
  const mod = await import('firebase/database');
  return { mod, database: mod.getDatabase(app, databaseUrl) };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function readUsage(mod: Rtdb, database: Database, institutionId: string): Promise<Usage> {
  const [inst, total] = await Promise.all([
    mod.get(mod.ref(database, institutionUsagePath(institutionId))),
    mod.get(mod.ref(database, TOTAL_USAGE_PATH)),
  ]);
  return { institution: Number(inst.val() ?? 0), total: Number(total.val() ?? 0) };
}

async function readUsageOrFail(mod: Rtdb, database: Database, institutionId: string): Promise<Usage> {
  try {
    return await withTimeout(readUsage(mod, database, institutionId), BLOB_USAGE_READ_TIMEOUT_MS);
  } catch {
    throw new BlobStoreError('Could not reach the file store. Check your connection and try again.');
  }
}

/** The warning to show when the school is running out of large-file storage, or null. Never throws. */
export async function readBudgetWarning(institutionId: string): Promise<string | null> {
  try {
    const { mod, database } = await load();
    return budgetWarningMessage(await readUsageOrFail(mod, database, institutionId));
  } catch {
    return null; // only a courtesy: the upload itself still checks the budgets
  }
}

/**
 * Stores a file and returns its key for the Firestore record. One multi-path
 * update writes the file and raises both usage counters by its size; if another
 * upload moved a counter first the rules refuse it, so it re-reads and retries.
 */
export async function putBlob(
  institutionId: string,
  doc: Pick<ProcessedDocument, 'dataUrl' | 'mimeType' | 'size'>,
  uploadedBy: string,
): Promise<string> {
  const { mod, database } = await load();
  const key = newBlobKey();

  for (let attempt = 1; attempt <= MAX_PUT_ATTEMPTS; attempt++) {
    const usage = await readUsageOrFail(mod, database, institutionId);
    const problem = checkBudget(usage, doc.size);
    if (problem) throw new BlobBudgetError(budgetMessage(problem));

    try {
      await withTimeout(
        mod.update(
          mod.ref(database),
          buildPutUpdate({
            institutionId,
            key,
            dataUrl: doc.dataUrl,
            mimeType: doc.mimeType,
            size: doc.size,
            uploadedBy,
            uploadedAt: mod.serverTimestamp(),
            usage,
          }),
        ),
        BLOB_UPLOAD_TIMEOUT_MS,
      );
      return key;
    } catch (error) {
      if (isPermissionDenied(error) && attempt < MAX_PUT_ATTEMPTS) continue; // a counter moved: retry
      if (error instanceof Error && error.message === 'timeout') {
        throw new BlobStoreError('The upload is taking too long. Check your connection and try again.');
      }
      throw new BlobStoreError('The file could not be saved. Please try again.');
    }
  }
  throw new BlobStoreError('The file could not be saved. Please try again.');
}

/** Fetches a file's data URL by its exact path, on demand. */
export async function getBlobDataUrl(institutionId: string, key: string): Promise<string> {
  const { mod, database } = await load();
  let snap;
  try {
    snap = await mod.get(mod.ref(database, blobPath(institutionId, key)));
  } catch {
    throw new BlobStoreError('Could not load the file. Check your connection and try again.');
  }
  const dataUrl = snap.exists() ? (snap.val() as { dataUrl?: unknown }).dataUrl : undefined;
  if (typeof dataUrl !== 'string') throw new BlobStoreError('This file is no longer available.');
  return dataUrl;
}

/**
 * Removes a file and lowers both counters by its size. Best effort: it never
 * throws, because by the time it runs the Firestore record is already gone and
 * the owner-run sweep removes whatever this misses. Returns whether it deleted.
 */
export async function deleteBlob(institutionId: string, key: string): Promise<boolean> {
  try {
    const { mod, database } = await load();
    for (let attempt = 1; attempt <= MAX_PUT_ATTEMPTS; attempt++) {
      const sizeSnap = await mod.get(mod.ref(database, `${blobPath(institutionId, key)}/size`));
      if (!sizeSnap.exists()) return false;
      const usage = await readUsage(mod, database, institutionId);
      try {
        await mod.update(
          mod.ref(database),
          buildDeleteUpdate({ institutionId, key, size: Number(sizeSnap.val()), usage }),
        );
        return true;
      } catch (error) {
        if (!isPermissionDenied(error)) return false; // otherwise a counter moved: retry
      }
    }
  } catch {
    // Non-fatal: the sweep script clears it.
  }
  return false;
}

/**
 * Removes several files, one at a time. Each delete reads the counters and then
 * writes them, and the rules refuse a write whose counter has moved, so overlapping
 * deletes refuse each other and can give up, leaving files for the sweep. Best
 * effort like deleteBlob: it never throws. Returns how many were deleted.
 */
export async function deleteBlobs(institutionId: string, keys: readonly string[]): Promise<number> {
  let deleted = 0;
  for (const key of keys) {
    if (await deleteBlob(institutionId, key)) deleted++;
  }
  return deleted;
}

/**
 * commitWithBlob for several files (a lesson note holds up to twelve). Each file
 * over the inline limit is uploaded in turn, then `commit` writes the Firestore
 * records, given one entry per file in the same order: its key, or null when it
 * is small and embedded. If an upload or `commit` fails, every file already
 * uploaded is removed again, so a failed save leaves nothing behind.
 *
 * All the large files are checked against the budgets together before the first
 * upload, so a note that cannot fit wastes no uploads. Files the same save removes
 * do not count as freed, since they are deleted only after `commit` succeeds, so a
 * note replaced near a full budget may be refused (the safe direction).
 *
 * `onUploading` stays on for the whole upload stage. `onProgress` reports the
 * uploads finished so far, out of the large files only.
 */
export async function commitWithBlobs(
  institutionId: string,
  files: readonly Pick<ProcessedDocument, 'dataUrl' | 'mimeType' | 'size'>[],
  uploadedBy: string,
  commit: (blobKeys: (string | null)[]) => Promise<void>,
  onUploading?: (uploading: boolean) => void,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const keys: (string | null)[] = files.map(() => null);
  const uploaded: string[] = [];
  const large = files.flatMap((file, i) => (needsBlobStore(file.size) ? [i] : []));
  try {
    if (large.length > 0) {
      onUploading?.(true);
      try {
        const { mod, database } = await load();
        const usage = await readUsageOrFail(mod, database, institutionId);
        const problem = checkBudget(usage, large.reduce((sum, i) => sum + files[i].size, 0));
        if (problem) throw new BlobBudgetError(budgetMessage(problem));
        onProgress?.(0, large.length);
        for (const i of large) {
          keys[i] = await putBlob(institutionId, files[i], uploadedBy);
          uploaded.push(keys[i] as string);
          onProgress?.(uploaded.length, large.length);
        }
      } finally {
        onUploading?.(false);
      }
    }
    await commit(keys);
  } catch (error) {
    await deleteBlobs(institutionId, uploaded); // best effort; the sweep clears a miss
    throw error;
  }
}

/**
 * Saves a record that points at a file, keeping the two stores in step: a file
 * over the inline limit is uploaded FIRST, then `commit` writes the Firestore
 * record (given the file's key, or null when the file is small and embedded).
 * If `commit` fails the just-uploaded file is removed again, so a failed save
 * does not leave a file nobody refers to. Small files never touch the Realtime
 * Database. `onUploading` lets a form show "Uploading…" while the file is sent.
 */
export async function commitWithBlob(
  institutionId: string,
  file: Pick<ProcessedDocument, 'dataUrl' | 'mimeType' | 'size'> | null,
  uploadedBy: string,
  commit: (blobKey: string | null) => Promise<void>,
  onUploading?: (uploading: boolean) => void,
): Promise<void> {
  if (!file || !needsBlobStore(file.size)) {
    await commit(null);
    return;
  }
  onUploading?.(true);
  let key: string;
  try {
    key = await putBlob(institutionId, file, uploadedBy);
  } finally {
    onUploading?.(false);
  }
  try {
    await commit(key);
  } catch (error) {
    await deleteBlob(institutionId, key); // best effort; the sweep script clears a miss
    throw error;
  }
}
