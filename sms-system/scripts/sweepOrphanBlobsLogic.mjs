// Pure decisions for scripts/sweep-orphan-blobs.mjs (no I/O, so they can be unit
// tested from src/lib/__tests__/sweepOrphanBlobs.test.ts).
// See docs/miscellaneous-specs/LARGE_ATTACHMENTS_RTDB_SPEC.md section 8.

export const DAY_MS = 86_400_000;
export const DEFAULT_GRACE_DAYS = 7;
// Below one day a file whose Firestore record is still being written (a slow or
// paused upload) could be mistaken for an orphan, so the script refuses it.
export const MIN_GRACE_DAYS = 1;

/** "institutionId/key", the identity of one stored file and of one reference to it. */
export const pairKey = (institutionId, key) => `${institutionId}/${key}`;

/** Grace period in days from a command-line value; throws if it is not a number of at least MIN_GRACE_DAYS. */
export function parseGraceDays(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_GRACE_DAYS;
  const days = Number(raw);
  if (!Number.isFinite(days) || days < MIN_GRACE_DAYS) {
    throw new Error(`--grace-days must be a number of at least ${MIN_GRACE_DAYS}.`);
  }
  return days;
}

/**
 * Sorts every stored file into exactly one group.
 *  - referenced: a lesson note or assignment still points at it (kept);
 *  - recent: unreferenced but uploaded within the grace period (kept: its record
 *    may still be on its way);
 *  - unknownAge: unreferenced with no usable uploadedAt (kept and reported: its
 *    age cannot be told);
 *  - orphans: unreferenced and older than the grace period (safe to delete).
 *
 * blobs: [{ institutionId, key, size, uploadedAt }]; referenced: Set of pairKey.
 */
export function classifyBlobs({ blobs, referenced, nowMs, graceMs }) {
  const out = { referenced: [], recent: [], unknownAge: [], orphans: [] };
  for (const blob of blobs) {
    if (referenced.has(pairKey(blob.institutionId, blob.key))) {
      out.referenced.push(blob);
    } else if (typeof blob.uploadedAt !== 'number' || !Number.isFinite(blob.uploadedAt)) {
      out.unknownAge.push(blob);
    } else if (nowMs - blob.uploadedAt < graceMs) {
      out.recent.push(blob);
    } else {
      out.orphans.push(blob);
    }
  }
  return out;
}

/** References whose file is not in the store: a record pointing at nothing (reported only). */
export function findDangling(referenced, present) {
  return [...referenced].filter((pair) => !present.has(pair)).sort();
}

const sizeOf = (blob) => (typeof blob.size === 'number' && Number.isFinite(blob.size) && blob.size > 0 ? blob.size : 0);

/** Files that count as zero bytes because their size is missing or not a positive number. */
export const withBadSize = (blobs) =>
  blobs.filter((b) => !(typeof b.size === 'number' && Number.isFinite(b.size) && b.size > 0));

/** Bytes per institution and in total, from the files that REMAIN. */
export function sumByInstitution(blobs) {
  const perInstitution = new Map();
  let total = 0;
  for (const blob of blobs) {
    const size = sizeOf(blob);
    perInstitution.set(blob.institutionId, (perInstitution.get(blob.institutionId) ?? 0) + size);
    total += size;
  }
  return { perInstitution, total };
}

/** A folder name that is safe in a database path (the rules also cap it at 128 characters). */
export const isValidInstitutionId = (id) => typeof id === 'string' && /^[^.$#[\]/\s]{1,128}$/.test(id);

/**
 * The counters that differ from what the remaining files add up to.
 *   stored: { institutions: { [id]: number }, total: number } as read from the database.
 *   actual: the result of sumByInstitution for the files that remain.
 *   institutionId: when the run is limited to one institution, `actual` covers only
 *     that folder, so only its counter can be reconciled; the global total is then
 *     moved by that institution's change alone (never recomputed from one folder).
 * Returns [{ path, label, from, to }]. A counter with no files left plans a 0.
 */
export function counterPlan({ stored, actual, institutionId }) {
  const plan = [];
  if (institutionId) {
    const from = Number(stored.institutions?.[institutionId] ?? 0);
    const to = actual.perInstitution.get(institutionId) ?? 0;
    if (from !== to) {
      plan.push({ path: `usage/institutions/${institutionId}/bytes`, label: `institution ${institutionId}`, from, to });
      const totalFrom = Number(stored.total ?? 0);
      plan.push({
        path: 'usage/total/bytes',
        label: 'total (this institution\u2019s change only)',
        from: totalFrom,
        to: Math.max(0, totalFrom + (to - from)),
      });
    }
    return plan;
  }
  const ids = new Set([...Object.keys(stored.institutions ?? {}), ...actual.perInstitution.keys()]);
  for (const id of [...ids].sort()) {
    const from = Number(stored.institutions?.[id] ?? 0);
    const to = actual.perInstitution.get(id) ?? 0;
    if (from !== to) plan.push({ path: `usage/institutions/${id}/bytes`, label: `institution ${id}`, from, to });
  }
  const from = Number(stored.total ?? 0);
  if (from !== actual.total) plan.push({ path: 'usage/total/bytes', label: 'total', from, to: actual.total });
  return plan;
}

/** First characters of a key, for the report. A full key is a capability and is never printed. */
export const shortKey = (key) => `${String(key).slice(0, 8)}…`;
