#!/usr/bin/env node
/**
 * Firestore institution-nesting migration script.
 * See docs/overhaul/FIRESTORE_INSTITUTION_NESTING_SPEC.md §10 for the full design.
 *
 * Copies documents from flat top-level collections (e.g. `results`) to their
 * nested path (`institutions/{institutionId}/results/{docId}`), preserving
 * document IDs. Copy is non-destructive and idempotent by default; deleting
 * the flat originals is a separate, explicit, later invocation (--delete-source),
 * never bundled into the copy pass — see §10.1/§10.4.
 *
 * Run locally — this requires a service-account key and is never executed
 * from a coding environment. Never commit the key file (see .gitignore).
 *
 * PILOT SCALE ONLY — not safe above roughly 10k documents per collection as
 * written. Each collection is loaded into memory in one `.get()` (no
 * `.limit()`/pagination), and per-document existence checks are awaited one
 * at a time rather than batched (~2 round trips per document). Fine at "a
 * handful of pilot schools" (see spec §14.7); would OOM or take hours
 * against a real multi-school dataset — add pagination and batch the
 * existence checks (e.g. `db.getAll(...refs)`) before reusing this at scale.
 *
 * Usage:
 *   node scripts/migrate-to-institutions.mjs --phase=<5|6|7|8|9|legacy|all> [--delete-source] [--overwrite] [--dry-run] [--key=<path>]
 *
 * Examples:
 *   node scripts/migrate-to-institutions.mjs --phase=legacy --dry-run
 *   node scripts/migrate-to-institutions.mjs --phase=5
 *   node scripts/migrate-to-institutions.mjs --phase=5 --delete-source
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// One entry per §11 phase — keeps each invocation scoped to that phase's
// collections only, matching the phased cutover, not a single big-bang copy.
const PHASE_COLLECTIONS = {
  5: ['houses', 'departments', 'events', 'announcements', 'nonSchoolDays', 'academicYears'],
  6: ['subjects', 'classes', 'terms'],
  7: [
    'exams', 'assignments', 'results', 'feedback_comments', 'lessons',
    'timetable_slots', 'subjectEnrollments', 'gradebooks',
  ],
  8: ['generalAttendance', 'subjectAttendance', 'attendanceSummaries'],
  9: [
    'studentActivities', 'studentResponsibilities', 'reportCardComments',
    'reportCards', 'disciplinaryActions',
  ],
  legacy: ['teachers', 'students', 'parents', 'teacher_classes', 'attendance'], // §3.13, §10.6
};

const BATCH_LIMIT = 450; // stay under Firestore's 500-op batch limit

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/migrate-to-institutions.mjs --phase=<5|6|7|8|9|legacy|all> [--delete-source] [--overwrite] [--dry-run] [--key=<path>]

  --phase=<N>       Migrate one §11 phase's collections (5, 6, 7, 8, or 9).
  --phase=legacy    Archive the 5 legacy collections (§10.6) — teachers, students,
                     parents, teacher_classes, attendance. No deletion pass is
                     expected for these (§10.6) but --delete-source still works
                     if you choose to run one later.
  --phase=all       Copy every non-legacy phase (5-9) in one run. Convenience only —
                     production rollout should still go phase-by-phase per §11.
  --delete-source   Delete the flat originals for the given phase instead of copying.
                     Run this only after §10.4 steps 3-5 (spot-check, deploy,
                     smoke-test) have passed for that phase — never in the same
                     invocation as a copy. Skips (does not delete) any flat
                     document whose nested copy doesn't exist yet.
  --overwrite       When copying, overwrite a destination document that already
                     exists. Default (no flag) skips anything already at the
                     destination, so re-running a copy pass after nested paths
                     have live writes doesn't revert them.
  --dry-run         Log what would be copied/deleted without writing to Firestore.
  --key=<path>      Path to a service-account JSON key. If omitted, falls back to
                     GOOGLE_APPLICATION_CREDENTIALS.

Examples:
  node scripts/migrate-to-institutions.mjs --phase=legacy --dry-run
  node scripts/migrate-to-institutions.mjs --phase=5
  node scripts/migrate-to-institutions.mjs --phase=5 --delete-source
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { phase: null, deleteSource: false, overwrite: false, dryRun: false, keyPath: null };
  for (const arg of argv) {
    if (arg === '--delete-source') opts.deleteSource = true;
    else if (arg === '--overwrite') opts.overwrite = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--phase=')) opts.phase = arg.slice('--phase='.length);
    else if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  if (!opts.phase) printUsageAndExit(1);
  return opts;
}

function resolveCollections(phase) {
  if (phase === 'all') {
    return [...new Set([5, 6, 7, 8, 9].flatMap((p) => PHASE_COLLECTIONS[p]))];
  }
  const key = phase === 'legacy' ? 'legacy' : Number(phase);
  const collections = PHASE_COLLECTIONS[key];
  if (!collections) {
    console.error(`Unknown phase "${phase}". Valid values: 5, 6, 7, 8, 9, legacy, all.`);
    process.exit(1);
  }
  return collections;
}

function initFirestore(keyPath) {
  const credential = keyPath
    ? cert(JSON.parse(readFileSync(keyPath, 'utf8')))
    : applicationDefault();
  const app = initializeApp({ credential });
  return getFirestore(app);
}

async function commitIfNeeded(db, batchRef, opsInBatch) {
  if (opsInBatch.count >= BATCH_LIMIT) {
    await batchRef.batch.commit();
    batchRef.batch = db.batch();
    opsInBatch.count = 0;
  }
}

// Canonical form for deep-equality comparison: sorts object keys so field
// order doesn't cause a false mismatch, and defers to a value's own toJSON()
// (Timestamp, GeoPoint) rather than recursing into its internal shape.
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value.toJSON === 'function') return value.toJSON();
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
}

// Verifies the nested copy actually matches the flat original's fields, not
// just that a document happens to exist at the destination — a document
// present but truncated or written by a different/partial path would
// otherwise pass the existence-only check that gates permanent deletion.
function documentsMatch(flatData, nestedData) {
  return JSON.stringify(canonicalize(flatData)) === JSON.stringify(canonicalize(nestedData));
}

async function copyCollection(db, name, { dryRun, overwrite }) {
  const snap = await db.collection(name).get();
  const batchRef = { batch: db.batch() };
  const opsInBatch = { count: 0 };
  let copied = 0;
  let skipped = 0;
  let skippedExists = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const institutionId = data.institutionId;
    if (!institutionId) {
      console.warn(`  SKIP ${name}/${doc.id} — no institutionId field`);
      skipped++;
      continue;
    }

    const dest = db.collection('institutions').doc(institutionId).collection(name).doc(doc.id);
    let parentSkipped = false;

    // Check existence in both modes — a dry run must make the same
    // skip/copy decision the real run would, otherwise its counts don't
    // reconcile with what actually happens (a dry run that always says
    // "would copy" even for documents the real run will skip is not a
    // meaningful preview).
    if (!overwrite && (await dest.get()).exists) {
      console.warn(
        `  ${dryRun ? '[dry-run] would ' : ''}SKIP ${name}/${doc.id} — already exists at destination, use --overwrite to replace`,
      );
      skippedExists++;
      parentSkipped = true;
    } else if (dryRun) {
      console.log(`  [dry-run] would copy ${name}/${doc.id} -> institutions/${institutionId}/${name}/${doc.id}`);
    } else {
      batchRef.batch.set(dest, data);
      opsInBatch.count++;
      await commitIfNeeded(db, batchRef, opsInBatch);
    }
    if (!parentSkipped) copied++;

    // Always reconcile columns, even when the parent gradebook itself was
    // just skipped as already-existing — a parent existing at the
    // destination does not mean every one of its columns landed there too
    // (e.g. a prior copy pass was interrupted mid-columns). Each column
    // gets its own independent skip-if-exists check.
    if (name === 'gradebooks') {
      const columns = await doc.ref.collection('columns').get();
      for (const col of columns.docs) {
        const colDest = dest.collection('columns').doc(col.id);
        if (!overwrite && (await colDest.get()).exists) {
          console.warn(
            `  ${dryRun ? '[dry-run] would ' : ''}SKIP ${name}/${doc.id}/columns/${col.id} — already exists at destination, use --overwrite to replace`,
          );
          skippedExists++;
        } else if (dryRun) {
          console.log(`  [dry-run] would copy ${name}/${doc.id}/columns/${col.id}`);
        } else {
          batchRef.batch.set(colDest, col.data());
          opsInBatch.count++;
          await commitIfNeeded(db, batchRef, opsInBatch);
        }
      }
    }
  }

  if (!dryRun && opsInBatch.count > 0) await batchRef.batch.commit();
  console.log(
    `${name}: ${dryRun ? 'would copy' : 'copied'} ${copied} document(s)` +
    (skipped ? `, skipped ${skipped} (no institutionId)` : '') +
    (skippedExists ? `, skipped ${skippedExists} (already exists at destination)` : ''),
  );
}

async function deleteFlatOriginals(db, name, { dryRun }) {
  const snap = await db.collection(name).get();
  const batchRef = { batch: db.batch() };
  const opsInBatch = { count: 0 };
  let deleted = 0;
  let skipped = 0;
  let skippedNoCopy = 0;
  let skippedMismatch = 0;

  for (const doc of snap.docs) {
    const institutionId = doc.data().institutionId;
    if (!institutionId) {
      console.warn(`  SKIP ${name}/${doc.id} — no institutionId field, was never copied, leaving in place`);
      skipped++;
      continue;
    }

    const dest = db.collection('institutions').doc(institutionId).collection(name).doc(doc.id);
    const destSnap = await dest.get();
    if (!destSnap.exists) {
      console.warn(`  SKIP ${name}/${doc.id} — no nested copy at institutions/${institutionId}/${name}/${doc.id}`);
      skippedNoCopy++;
      continue;
    }
    if (!documentsMatch(doc.data(), destSnap.data())) {
      console.warn(`  SKIP ${name}/${doc.id} — nested copy exists but its fields don't match the flat original (partial or stale copy?), not deleting`);
      skippedMismatch++;
      continue;
    }

    // Parent existing at the destination isn't enough for gradebooks — an
    // interrupted-then-resumed copy pass can leave a nested gradebook with
    // fewer columns than its flat original. Compare counts before allowing
    // the delete, since this is the only gate standing between the flat
    // columns and permanent loss.
    let srcColumns = null;
    if (name === 'gradebooks') {
      const [srcCols, dstCols] = await Promise.all([
        doc.ref.collection('columns').get(),
        dest.collection('columns').get(),
      ]);
      if (srcCols.size !== dstCols.size) {
        console.warn(`  SKIP ${name}/${doc.id} — column count mismatch (flat ${srcCols.size} vs nested ${dstCols.size}), not deleting`);
        skippedMismatch++;
        continue;
      }
      srcColumns = srcCols;
    }

    if (dryRun) {
      console.log(`  [dry-run] would delete ${name}/${doc.id}`);
    } else {
      if (name === 'gradebooks') {
        for (const col of srcColumns.docs) {
          batchRef.batch.delete(col.ref);
          opsInBatch.count++;
          await commitIfNeeded(db, batchRef, opsInBatch);
        }
      }
      batchRef.batch.delete(doc.ref);
      opsInBatch.count++;
      await commitIfNeeded(db, batchRef, opsInBatch);
    }
    deleted++;
  }

  if (!dryRun && opsInBatch.count > 0) await batchRef.batch.commit();
  console.log(
    `${name}: ${dryRun ? 'would delete' : 'deleted'} ${deleted} document(s)` +
    (skipped ? `, skipped ${skipped} (no institutionId)` : '') +
    (skippedNoCopy ? `, skipped ${skippedNoCopy} (no nested copy found)` : '') +
    (skippedMismatch ? `, skipped ${skippedMismatch} (nested copy doesn't match flat original)` : ''),
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const collections = resolveCollections(opts.phase);
  const db = initFirestore(opts.keyPath);

  console.log(`Phase: ${opts.phase} (${collections.length} collection${collections.length === 1 ? '' : 's'})`);
  console.log(`Mode: ${opts.deleteSource ? 'DELETE flat originals' : 'COPY to nested paths'}${opts.dryRun ? ' [dry-run]' : ''}`);
  console.log('');

  for (const name of collections) {
    if (opts.deleteSource) {
      await deleteFlatOriginals(db, name, { dryRun: opts.dryRun });
    } else {
      await copyCollection(db, name, { dryRun: opts.dryRun, overwrite: opts.overwrite });
    }
  }

  console.log('');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
