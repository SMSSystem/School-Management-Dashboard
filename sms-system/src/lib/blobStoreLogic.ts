import type { Role } from './firebase';
import type { LargeUploadPolicy } from './documentUpload';
import { canUploadLargeFiles } from './roleCapabilities';

// Pure parts of the large-attachment store (LARGE_ATTACHMENTS_RTDB_SPEC.md):
// paths, budgets and the multi-path updates that database.rules.json checks.
// Kept free of the Firebase SDK so it is unit-testable; blobStore.ts is the thin
// wrapper that talks to the Realtime Database.

// Mirrors database.rules.json (the rules refuse a counter above these).
// The counters add each file's raw size, but the database stores base64, about 4/3
// larger: the total of 700,000,000 is about 933 MB stored, under the 1 GB Spark limit.
export const INSTITUTION_BUDGET_BYTES = 200_000_000;
export const TOTAL_BUDGET_BYTES = 700_000_000;
// From here the form warns the person saving that their school is running out.
const BUDGET_WARNING_RATIO = 0.8;

// A 5 MiB upload on a slow school network can take a while; past this the
// caller is told it failed, though the write may still land later (the orphan
// sweep, spec section 8, removes it).
export const BLOB_UPLOAD_TIMEOUT_MS = 120_000;

// How long a download may take. Offline, the database's get() waits for a connection and never fails, so without a
// limit a Download all run would sit on one file for good.
export const BLOB_DOWNLOAD_TIMEOUT_MS = 120_000;

// How long the two counter reads before an upload may take. Offline, the database's get() waits for a connection and never
// fails, so without a limit the upload dialog would stay on "Uploading" for good.
export const BLOB_USAGE_READ_TIMEOUT_MS = 20_000;

export const TOTAL_USAGE_PATH = 'usage/total/bytes';
export const blobPath = (institutionId: string, key: string): string => `files/${institutionId}/${key}`;
export const institutionUsagePath = (institutionId: string): string =>
  `usage/institutions/${institutionId}/bytes`;

// A lower-case UUID, never a Firebase push id (those are partly guessable).
// firestore.rules (isValidBlobKey) and database.rules.json accept exactly this.
export const newBlobKey = (): string => crypto.randomUUID();

// Realtime Database keys cannot contain . $ # [ ] / and are limited in length;
// the rules also cap the institution id at 128 characters.
const INSTITUTION_ID_RE = /^[^.$#[\]/\s]{1,128}$/;
export const isValidInstitutionId = (id: string): boolean => INSTITUTION_ID_RE.test(id);

export type Usage = { institution: number; total: number };

export type BudgetProblem = 'institution' | 'total';

/** Which budget a new file of `size` bytes would overflow, if any (the school's first). */
export function checkBudget(usage: Usage, size: number): BudgetProblem | null {
  if (usage.institution + size > INSTITUTION_BUDGET_BYTES) return 'institution';
  if (usage.total + size > TOTAL_BUDGET_BYTES) return 'total';
  return null;
}

export function budgetMessage(problem: BudgetProblem): string {
  return problem === 'institution'
    ? 'Your school’s large-file storage is full. Delete an older lesson note or assignment file, or use a smaller file.'
    : 'The system’s large-file storage is full. Use a file under 500KB, or ask an administrator to free up space.';
}

/** A warning once the school has used BUDGET_WARNING_RATIO of its budget, or null below that. */
export function budgetWarningMessage(usage: Usage): string | null {
  if (usage.institution < INSTITUTION_BUDGET_BYTES * BUDGET_WARNING_RATIO) return null;
  const percent = Math.min(100, Math.floor((usage.institution / INSTITUTION_BUDGET_BYTES) * 100));
  return `Your school’s large-file storage is ${percent}% full.`;
}

export type PutArgs = {
  institutionId: string;
  key: string;
  dataUrl: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  /** Realtime Database's server timestamp sentinel (serverTimestamp()), passed in so this stays SDK-free. */
  uploadedAt: unknown;
  usage: Usage;
};

/**
 * The ONE multi-path update that stores a file: the file itself and both
 * counters raised by its size. The rules require the counters to move by exactly
 * the file's size in the same write, and reject an overwrite.
 */
export function buildPutUpdate(a: PutArgs): Record<string, unknown> {
  if (!isValidInstitutionId(a.institutionId)) throw new Error('Invalid institution id for the file store.');
  if (!Number.isFinite(a.size) || a.size <= 0) throw new Error('Invalid file size.');
  return {
    [blobPath(a.institutionId, a.key)]: {
      dataUrl: a.dataUrl,
      size: a.size,
      mimeType: a.mimeType,
      uploadedAt: a.uploadedAt,
      uploadedBy: a.uploadedBy,
    },
    [institutionUsagePath(a.institutionId)]: a.usage.institution + a.size,
    [TOTAL_USAGE_PATH]: a.usage.total + a.size,
  };
}

export type DeleteArgs = { institutionId: string; key: string; size: number; usage: Usage };

/** The multi-path update that removes a file and lowers both counters by its size (never below 0). */
export function buildDeleteUpdate(a: DeleteArgs): Record<string, unknown> {
  if (!isValidInstitutionId(a.institutionId)) throw new Error('Invalid institution id for the file store.');
  return {
    [blobPath(a.institutionId, a.key)]: null,
    [institutionUsagePath(a.institutionId)]: Math.max(0, a.usage.institution - a.size),
    [TOTAL_USAGE_PATH]: Math.max(0, a.usage.total - a.size),
  };
}

/** A refused write, which on a counter-checked upload usually means another upload moved the counter first. */
export function isPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  return (
    (typeof e.code === 'string' && e.code.toUpperCase().includes('PERMISSION_DENIED')) ||
    (typeof e.message === 'string' && e.message.toUpperCase().includes('PERMISSION_DENIED'))
  );
}

/**
 * Which upload limit applies to a caller: 'none' for roles that keep the 500KB
 * limit, 'enabled' for teacher/admin roles when the Realtime Database is
 * configured, and 'unconfigured' for those roles when it is not (a clear error
 * instead of a silent downgrade, spec D11).
 */
export function policyFor(role: Role | null | undefined, hasDatabaseUrl: boolean): LargeUploadPolicy {
  if (!canUploadLargeFiles(role)) return 'none';
  return hasDatabaseUrl ? 'enabled' : 'unconfigured';
}
