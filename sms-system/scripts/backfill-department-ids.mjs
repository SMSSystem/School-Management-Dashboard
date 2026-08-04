#!/usr/bin/env node
/**
 * One-time backfill: copies departmentId from the legacy teachers/{uid}
 * mirror onto users/{uid}, for existing production accounts created before
 * the department-lookup fix.
 * See docs/overhaul/FIRESTORE_INSTITUTION_NESTING_SPEC.md §13.1/§11 step 4.
 *
 * Why this is needed: once isSeniorTeacherFor() reads users.departmentId
 * instead of the teachers mirror, any existing teacher account whose
 * departmentId currently only lives on the teachers/{uid} mirror would
 * have no departmentId on users/{uid} at all — breaking their
 * senior-teacher department-scoped permissions until someone happens to
 * re-save them via TeacherForm. Run this once, before or alongside the
 * firestore.rules deploy that makes that rewrite live — for this overhaul,
 * that meant running it during the cutover runbook's Phase A, ahead of the
 * PR merge (see CUTOVER_RUNBOOK.md A2); a future reuse of this script
 * against a different rules rollout would run it on whatever timeline that
 * rollout's own sequencing calls for.
 *
 * Idempotent — only writes users/{uid}.departmentId, only for teachers
 * whose mirror doc actually has one set. Safe to re-run.
 *
 * Run locally — this requires a service-account key and is never executed
 * from a coding environment. Never commit the key file (see .gitignore).
 *
 * PILOT SCALE ONLY — not safe above roughly 10k documents in the `teachers`
 * mirror as written. The whole collection is loaded into memory in one
 * `.get()` (no `.limit()`/pagination), and each teacher's matching `users`
 * doc is fetched one at a time rather than batched. Fine at pilot scale;
 * add pagination and batch the lookups (e.g. `db.getAll(...refs)`) before
 * reusing this against a real multi-school dataset.
 *
 * Usage:
 *   node scripts/backfill-department-ids.mjs [--dry-run] [--key=<path>]
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BATCH_LIMIT = 450; // stay under Firestore's 500-op batch limit

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/backfill-department-ids.mjs [--dry-run] [--key=<path>]

  --dry-run      Log what would be written without touching Firestore.
  --key=<path>   Path to a service-account JSON key. If omitted, falls back to
                 GOOGLE_APPLICATION_CREDENTIALS.
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { dryRun: false, keyPath: null };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  return opts;
}

function initFirestore(keyPath) {
  const credential = keyPath
    ? cert(JSON.parse(readFileSync(keyPath, 'utf8')))
    : applicationDefault();
  const app = initializeApp({ credential });
  return getFirestore(app);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const db = initFirestore(opts.keyPath);

  console.log(`Mode: backfill users.departmentId from teachers mirror${opts.dryRun ? ' [dry-run]' : ''}`);
  console.log('');

  const teachersSnap = await db.collection('teachers').get();
  let batch = db.batch();
  let opsInBatch = 0;
  let backfilled = 0;
  let skippedNoDept = 0;
  let skippedNoUser = 0;
  let skippedAlreadySet = 0;

  for (const teacherDoc of teachersSnap.docs) {
    const departmentId = teacherDoc.data().departmentId;
    if (!departmentId) {
      skippedNoDept++;
      continue;
    }

    const userRef = db.collection('users').doc(teacherDoc.id);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      console.warn(`  SKIP users/${teacherDoc.id} — no matching users doc for this teacher mirror`);
      skippedNoUser++;
      continue;
    }

    if (userSnap.data().departmentId === departmentId) {
      skippedAlreadySet++;
      continue;
    }

    if (opts.dryRun) {
      console.log(`  [dry-run] would set users/${teacherDoc.id}.departmentId = ${departmentId}`);
    } else {
      batch.set(userRef, { departmentId }, { merge: true });
      opsInBatch++;
      if (opsInBatch >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    }
    backfilled++;
  }

  if (!opts.dryRun && opsInBatch > 0) await batch.commit();

  console.log('');
  console.log(
    `${opts.dryRun ? 'Would backfill' : 'Backfilled'} ${backfilled} user(s). ` +
    `Skipped: ${skippedNoDept} (mirror had no departmentId), ` +
    `${skippedNoUser} (no matching users doc), ` +
    `${skippedAlreadySet} (already correct).`,
  );
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
