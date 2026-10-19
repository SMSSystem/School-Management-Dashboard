#!/usr/bin/env node
/**
 * One-time backfill: gives every student a `classIds` list (their home class first, then any
 * additional classes already there), so class rosters, head-counts and what a student sees,
 * which are read from `classIds` (src/lib/studentClasses.ts), include everyone.
 *
 * Why this is needed: before students could be in several classes, a student carried only
 * `classId`. The class roster, the Classes list Population and the grade-tracking counts now ask
 * `classIds array-contains <class>`, which a student without `classIds` does not match. Run this
 * BEFORE deploying the app version that reads `classIds` (an institution admin can instead press
 * "Update class lists" on the Backfill Classes page, but only once that version is live, and
 * until then the lists would show too few students).
 *
 * Idempotent: writes only `classIds`, only where it is missing or does not start with the home
 * class, and never changes `classId`, `classSubjects` or any other field. A student with no
 * `classId` is left alone. Safe to re-run.
 *
 * It changes who is in which class, which the stored class head-counts follow
 * (src/lib/classPopulationDelta.ts), so afterwards run:
 *   node scripts/recount-class-populations.mjs --key=<path> --institution=<id> --live
 *
 * Run locally - this requires a service-account key and is never executed from a coding
 * environment. Never commit the key file (see .gitignore).
 *
 * PILOT SCALE ONLY: every student document is loaded in one `.get()` (no pagination). Fine for
 * a few thousand students; add pagination before running it against a much larger dataset.
 *
 * Usage:
 *   node scripts/backfill-student-class-ids.mjs [--dry-run] [--institution=<id>] [--key=<path>]
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BATCH_LIMIT = 450; // stay under Firestore's 500-op batch limit

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/backfill-student-class-ids.mjs [--dry-run] [--institution=<id>] [--key=<path>]

  --dry-run          Log what would be written without touching Firestore.
  --institution=<id> Only this institution's students (default: every institution).
  --key=<path>       Path to a service-account JSON key. If omitted, falls back to
                     GOOGLE_APPLICATION_CREDENTIALS.
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { dryRun: false, institution: null, keyPath: null };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--institution=')) opts.institution = arg.slice('--institution='.length);
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
  const credential = keyPath ? cert(JSON.parse(readFileSync(keyPath, 'utf8'))) : applicationDefault();
  const app = initializeApp({ credential });
  return getFirestore(app);
}

/** The classIds a student should have: home class first, then the other classes already listed, no repeats. null = no home class. */
function wantedClassIds(data) {
  const home = typeof data.classId === 'string' ? data.classId : '';
  if (!home) return null;
  const stored = Array.isArray(data.classIds) ? data.classIds.filter((c) => typeof c === 'string' && c) : [];
  return [...new Set([home, ...stored])];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const db = initFirestore(opts.keyPath);

  console.log(
    `Mode: backfill users.classIds for students${opts.institution ? ` of ${opts.institution}` : ''}${opts.dryRun ? ' [dry-run]' : ''}`,
  );
  console.log('');

  let q = db.collection('users').where('role', '==', 'student');
  if (opts.institution) q = q.where('institutionId', '==', opts.institution);
  const snap = await q.get();

  let batch = db.batch();
  let opsInBatch = 0;
  let updated = 0;
  let alreadyOk = 0;
  let noClass = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const want = wantedClassIds(data);
    if (!want) {
      noClass++;
      continue;
    }
    const have = Array.isArray(data.classIds) ? data.classIds : [];
    if (JSON.stringify(want) === JSON.stringify(have)) {
      alreadyOk++;
      continue;
    }
    if (opts.dryRun) {
      console.log(`  [dry-run] would set users/${doc.id}.classIds = ${JSON.stringify(want)}`);
    } else {
      batch.update(doc.ref, { classIds: want });
      opsInBatch++;
      if (opsInBatch >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    }
    updated++;
  }
  if (!opts.dryRun && opsInBatch > 0) await batch.commit();

  console.log('');
  console.log(`Students read:            ${snap.size}`);
  console.log(`${opts.dryRun ? 'Would update' : 'Updated'}:             ${updated}`);
  console.log(`Already correct:          ${alreadyOk}`);
  console.log(`No class (left alone):    ${noClass}`);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
