#!/usr/bin/env node
/**
 * 4-month metadata-only trim — ASSIGNMENTS_FEATURE_SPEC.md §9.2
 * (Implementation Order step 7). Firestore's native TTL feature (§9.1) can
 * only delete a *whole document*; it can't strip a single field on a
 * schedule. This script does that: once an `attempts` document's `deleteAt`
 * is within the trim window, its `fileDataUrl`/`mimeType` are cleared —
 * fileName/fileSize/submittedAt/attemptNumber/deleteAt/assignmentDueDate all
 * survive. The parent `submissions/{studentId}` document is also trimmed
 * when its own duplicated copy of the file *is* the affected attempt (§4.2 —
 * the current attempt's file is kept on both the parent doc and its own
 * attempts/{n} entry, for a single-document "download current submission"
 * read).
 *
 * Per §3 decision 16, this is run manually, on whatever cadence the operator
 * chooses — not wired to any scheduler. Idempotent (a document already
 * missing fileDataUrl is skipped), matching every other backfill-style
 * script in this repo.
 *
 * Prerequisite: the two TTL policies (§9.1) and the `attempts`
 * collection-group index on `deleteAt` (firestore.indexes.json) must already
 * be deployed — this script's own query needs that index, and without the
 * TTL policies, "trimmed" documents would sit around with only metadata
 * forever instead of eventually being deleted outright at the 6-month mark.
 * Enable the TTL policies via (not part of `firebase deploy` — a separate
 * Firestore API, run once):
 *
 *   gcloud firestore fields ttls update deleteAt \
 *     --collection-group=submissions --enable-ttl
 *   gcloud firestore fields ttls update deleteAt \
 *     --collection-group=attempts --enable-ttl
 *
 * (Or the equivalent in the Firebase Console: Firestore → TTL policies.)
 * See docs/miscellaneous-specs/ASSIGNMENTS_RETENTION_QA_RUNBOOK.md for the
 * full setup + verification walkthrough against a disposable QA institution,
 * per this project's established "never against a real institution first"
 * discipline (§12).
 *
 * Run locally — requires a service-account key (scripts/service-account.json,
 * gitignored, never committed), same as every other scripts/*.mjs tool here.
 *
 * Usage:
 *   node scripts/trim-old-submission-attachments.mjs [--dry-run] [--key=<path>]
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const BATCH_LIMIT = 450; // stay under Firestore's 500-op batch limit

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/trim-old-submission-attachments.mjs [--dry-run] [--key=<path>]

  --dry-run      Log what would be trimmed without touching Firestore.
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

  console.log(`Mode: 4-month metadata-only trim${opts.dryRun ? ' [dry-run]' : ''}`);
  console.log('');

  // NOT "four months from now" despite what a shorter name might suggest —
  // deleteAt = dueDate + 182d (§9.1's "6 months"), so "dueDate + 121d
  // ('4 months') has already passed" algebraically rearranges to
  // "deleteAt <= now + 61d" (182 - 121 = 61). A variable literally named
  // fourMonthsFromNow in an earlier draft computed `now + 2 months`, which
  // was directionally correct but a genuine footgun for anyone implementing
  // from the name alone instead of the math (§9.2) — this name and the
  // 61-day figure are deliberate.
  const deleteAtCutoffForFourMonthTrim = Timestamp.fromDate(
    new Date(Date.now() + 61 * 24 * 60 * 60 * 1000),
  );

  const attemptsSnap = await db
    .collectionGroup('attempts')
    .where('deleteAt', '<=', deleteAtCutoffForFourMonthTrim)
    .get();

  console.log(`Found ${attemptsSnap.size} attempt document(s) past the trim cutoff.`);

  let trimmedAttempts = 0;
  let alreadyTrimmed = 0;
  let trimmedParents = 0;
  let batch = db.batch();
  let opsInBatch = 0;

  const flush = async () => {
    if (opsInBatch === 0) return;
    if (!opts.dryRun) await batch.commit();
    batch = db.batch();
    opsInBatch = 0;
  };

  for (const attemptDoc of attemptsSnap.docs) {
    const data = attemptDoc.data();
    if (!('fileDataUrl' in data)) {
      alreadyTrimmed++;
      continue;
    }

    if (opts.dryRun) {
      console.log(`  [dry-run] would trim ${attemptDoc.ref.path}`);
    } else {
      batch.update(attemptDoc.ref, { fileDataUrl: FieldValue.delete(), mimeType: FieldValue.delete() });
      opsInBatch++;
    }
    trimmedAttempts++;

    // Also trim the parent SubmissionDocument when its own duplicated file
    // *is* this attempt — otherwise the parent's copy would outlive the
    // attempts subcollection's own trimmed one.
    const submissionRef = attemptDoc.ref.parent.parent;
    if (submissionRef) {
      const submissionSnap = await submissionRef.get();
      const submissionData = submissionSnap.data();
      if (
        submissionData &&
        submissionData.currentAttemptNumber === data.attemptNumber &&
        'fileDataUrl' in submissionData
      ) {
        if (opts.dryRun) {
          console.log(`  [dry-run] would also trim parent ${submissionRef.path}`);
        } else {
          batch.update(submissionRef, { fileDataUrl: FieldValue.delete(), mimeType: FieldValue.delete() });
          opsInBatch++;
        }
        trimmedParents++;
      }
    }

    if (opsInBatch >= BATCH_LIMIT) await flush();
  }

  await flush();

  console.log('');
  console.log(
    `${opts.dryRun ? 'Would trim' : 'Trimmed'} ${trimmedAttempts} attempt(s) and ${trimmedParents} parent submission doc(s). ` +
    `Skipped ${alreadyTrimmed} (already trimmed).`,
  );
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
