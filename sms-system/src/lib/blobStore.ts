import type { Database } from 'firebase/database';
import { app, databaseUrl, type Role } from './firebase';
import type { LargeUploadPolicy, ProcessedDocument } from './documentUpload';
import { needsBlobStore } from './documentUpload';
import {
  BLOB_UPLOAD_TIMEOUT_MS,
  TOTAL_USAGE_PATH,
  blobPath,
  budgetMessage,
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
    let usage: Usage;
    try {
      usage = await readUsage(mod, database, institutionId);
    } catch {
      throw new BlobStoreError('Could not reach the file store. Check your connection and try again.');
    }
    const problem = checkBudget(usage, doc.size);
    if (problem) throw new BlobStoreError(budgetMessage(problem));

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
