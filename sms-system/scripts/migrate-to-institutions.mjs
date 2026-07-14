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
 * Usage:
 *   node scripts/migrate-to-institutions.mjs --phase=<5|6|7|8|9|legacy|all> [--delete-source] [--dry-run] [--key=<path>]
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
Usage: node scripts/migrate-to-institutions.mjs --phase=<5|6|7|8|9|legacy|all> [--delete-source] [--dry-run] [--key=<path>]

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
                     invocation as a copy.
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
  const opts = { phase: null, deleteSource: false, dryRun: false, keyPath: null };
  for (const arg of argv) {
    if (arg === '--delete-source') opts.deleteSource = true;
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

async function copyCollection(db, name, { dryRun }) {
  const snap = await db.collection(name).get();
  const batchRef = { batch: db.batch() };
  const opsInBatch = { count: 0 };
  let copied = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const institutionId = data.institutionId;
    if (!institutionId) {
      console.warn(`  SKIP ${name}/${doc.id} — no institutionId field`);
      skipped++;
      continue;
    }

    const dest = db.collection('institutions').doc(institutionId).collection(name).doc(doc.id);

    if (dryRun) {
      console.log(`  [dry-run] would copy ${name}/${doc.id} -> institutions/${institutionId}/${name}/${doc.id}`);
    } else {
      batchRef.batch.set(dest, data);
      opsInBatch.count++;
      await commitIfNeeded(db, batchRef, opsInBatch);
    }
    copied++;

    if (name === 'gradebooks') {
      const columns = await doc.ref.collection('columns').get();
      for (const col of columns.docs) {
        if (dryRun) {
          console.log(`  [dry-run] would copy ${name}/${doc.id}/columns/${col.id}`);
        } else {
          batchRef.batch.set(dest.collection('columns').doc(col.id), col.data());
          opsInBatch.count++;
          await commitIfNeeded(db, batchRef, opsInBatch);
        }
      }
    }
  }

  if (!dryRun && opsInBatch.count > 0) await batchRef.batch.commit();
  console.log(
    `${name}: ${dryRun ? 'would copy' : 'copied'} ${copied} document(s)` +
    (skipped ? `, skipped ${skipped} (no institutionId)` : ''),
  );
}

async function deleteFlatOriginals(db, name, { dryRun }) {
  const snap = await db.collection(name).get();
  const batchRef = { batch: db.batch() };
  const opsInBatch = { count: 0 };
  let deleted = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const institutionId = doc.data().institutionId;
    if (!institutionId) {
      console.warn(`  SKIP ${name}/${doc.id} — no institutionId field, was never copied, leaving in place`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  [dry-run] would delete ${name}/${doc.id}`);
    } else {
      if (name === 'gradebooks') {
        const columns = await doc.ref.collection('columns').get();
        for (const col of columns.docs) {
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
    (skipped ? `, skipped ${skipped}` : ''),
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
      await copyCollection(db, name, { dryRun: opts.dryRun });
    }
  }

  console.log('');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
