#!/usr/bin/env node
/**
 * Removes stale subject enrollments: subjectEnrollments/{subjectId}_{classId}
 * documents whose subject no longer exists, or whose subject is scoped to specific
 * classes that do not include that class.
 *
 * Why: editing a subject to drop a class, and deleting a subject, used to leave its
 * enrollments behind (the Subject form only ever wrote them). Every student in that
 * class then saw the subject in My Attendance > By Subject, and parents in Child
 * Attendance. The app now removes them on edit and delete and ignores stale ones;
 * this clears the ones already there.
 *
 * DRY RUN BY DEFAULT: nothing is deleted unless you pass --live. A subject for the
 * whole institution (or an older one with no scope) is never treated as stale. Every
 * run (dry or live) writes a log of the enrollments it found, with the reason, to
 * scripts/logs/ (gitignored); it holds subject and class names, no personal data. A
 * deleted enrollment can be re-created by editing its subject (the form rewrites
 * the enrollments of the classes it lists).
 *
 * Reads: one per subject and one per enrollment. Writes: one delete per stale
 * enrollment, in batches of 400.
 *
 * Usage:
 *   node scripts/prune-stale-subject-enrollments.mjs --key=<path> [--institution=<id>] [--live]
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { planPrune } from './pruneStaleSubjectEnrollmentsLogic.mjs';

const BATCH = 400;

function printUsageAndExit(code) {
  console.log(`
Usage:
  node scripts/prune-stale-subject-enrollments.mjs --key=<path> [--institution=<id>] [--live]

  --key=<path>        Service-account JSON key (or set GOOGLE_APPLICATION_CREDENTIALS).
  --institution=<id>  Only this institution (default: every institution).
  --live              Actually delete. Omit for a dry run (the default).
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { keyPath: null, institution: null, live: false };
  for (const arg of argv) {
    if (arg === '--live') opts.live = true;
    else if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg.startsWith('--institution=')) opts.institution = arg.slice('--institution='.length);
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  if (opts.institution !== null && !/^[A-Za-z0-9_-]{1,64}$/.test(opts.institution)) {
    console.error('--institution must be a single institution id (no slashes, dots or spaces).');
    process.exit(1);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const keyPath = opts.keyPath ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath || !existsSync(keyPath)) {
    console.error('A service-account key is required: pass --key=<path> or set GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }
  const db = getFirestore(initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) }));

  console.log(`Mode: ${opts.live ? 'LIVE (will delete)' : 'dry run (nothing will be deleted)'}`);
  console.log(`Scope: ${opts.institution ? `institution ${opts.institution} only` : 'all institutions'}`);
  console.log('');

  const institutionIds = opts.institution
    ? [opts.institution]
    : (await db.collection('institutions').listDocuments()).map((d) => d.id);

  const log = [];
  let totalStale = 0;
  let deleted = 0;
  let failed = 0;

  for (const institutionId of institutionIds) {
    const inst = db.collection('institutions').doc(institutionId);
    const [subjectSnap, enrollSnap] = await Promise.all([
      inst.collection('subjects').get(),
      inst.collection('subjectEnrollments').get(),
    ]);
    if (enrollSnap.empty) continue;
    const subjects = subjectSnap.docs.map((d) => ({
      id: d.id,
      classScope: d.get('classScope'),
      classIds: d.get('classIds'),
    }));
    const enrollments = enrollSnap.docs.map((d) => ({
      id: d.id,
      ref: d.ref,
      subjectId: d.get('subjectId'),
      subjectName: d.get('subjectName'),
      classId: d.get('classId'),
      className: d.get('className'),
    }));
    const { keep, stale } = planPrune(enrollments, subjects);
    console.log(`${institutionId}: ${enrollments.length} enrollment(s), ${stale.length} stale, ${keep.length} kept`);
    for (const e of stale) {
      console.log(`  ${opts.live ? 'DELETE' : '[dry-run] would delete'} ${e.subjectName ?? e.subjectId} | ${e.className ?? e.classId} (${e.reason})`);
      log.push({
        institutionId,
        enrollmentId: e.id,
        subjectName: e.subjectName ?? null,
        className: e.className ?? null,
        reason: e.reason,
      });
    }
    totalStale += stale.length;

    if (opts.live) {
      for (let i = 0; i < stale.length; i += BATCH) {
        const batch = db.batch();
        const chunk = stale.slice(i, i + BATCH);
        chunk.forEach((e) => batch.delete(e.ref));
        try {
          await batch.commit();
          deleted += chunk.length;
        } catch (err) {
          failed += chunk.length;
          console.error(`  FAILED a batch of ${chunk.length}: ${err.message}`);
        }
      }
    }
  }

  console.log('');
  console.log(opts.live ? 'Summary:' : 'Dry-run summary:');
  console.log(`  Stale enrollments found: ${totalStale}`);
  if (opts.live) {
    console.log(`  Deleted: ${deleted}`);
    console.log(`  Failed: ${failed}`);
  }

  mkdirSync('scripts/logs', { recursive: true });
  const logPath = `scripts/logs/prune-stale-subject-enrollments-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(logPath, JSON.stringify({ live: opts.live, totalStale, deleted, failed, log }, null, 2));
  console.log(`Log: ${logPath}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
