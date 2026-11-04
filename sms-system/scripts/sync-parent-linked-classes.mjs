#!/usr/bin/env node
/**
 * Backfills and repairs each parent's `linkedClassIds`: the classes of their linked children, which the lesson-note file
 * rule reads (lessonNoteFileReadableBy in firestore.rules; src/lib/parentLinkedClasses.ts; docs/ISSUES_AND_GAPS.md #66).
 *
 * WHEN: once before that rule is first deployed, because a parent with no list is refused. Afterwards, whenever lists may
 * have drifted: after a class is deleted, after a bulk seed (seed-bulk-institution.mjs does not write the lists), or if a
 * parent is refused a file for their own child's class. Run a second dry run right before deploying the rule: it must
 * report nothing to change, or an admin tab still open on an older app has changed something since.
 *
 * Idempotent: writes only `linkedClassIds` and a link's `institutionId`, only where they differ. Safe to re-run.
 *
 * DRY RUN BY DEFAULT: nothing is written unless you pass --live. It prints the project id it is acting on, and counts
 * only: no names or ids, so the output is safe to share. Reads every link, and every parent and student of the scope, once.
 *
 * Needs a service-account key. Never commit the key file (see .gitignore).
 *
 * PILOT SCALE ONLY: everything is loaded in one `.get()` per collection (no pagination).
 *
 * Usage:
 *   node scripts/sync-parent-linked-classes.mjs --key=<path> [--institution=<id>] [--live]
 */

import { existsSync, readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { planParentLists } from './syncParentLinkedClassesLogic.mjs';
import { usageExit } from './adminCli.mjs';

const BATCH_LIMIT = 450; // stay under Firestore's 500-op batch limit

const printUsageAndExit = usageExit(`
Usage: node scripts/sync-parent-linked-classes.mjs --key=<path> [--institution=<id>] [--live]

  --key=<path>       Path to a service-account JSON key (or set GOOGLE_APPLICATION_CREDENTIALS).
  --institution=<id> Only this institution (default: every institution).
  --live             Actually write. Omit for a dry run (the default).
`);

function parseArgs(argv) {
  const opts = { live: false, institution: null, keyPath: null };
  for (const arg of argv) {
    if (arg === '--live') opts.live = true;
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
  const path = keyPath ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path || !existsSync(path)) {
    console.error('A service-account key is required: pass --key=<path> or set GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }
  const key = JSON.parse(readFileSync(path, 'utf8'));
  console.log(`Project: ${key.project_id}`);
  return getFirestore(initializeApp({ credential: cert(key) }));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const db = initFirestore(opts.keyPath);
  console.log(`Mode: ${opts.live ? 'LIVE' : 'dry run'}; scope: ${opts.institution ? 'one institution' : 'every institution'}`);

  const scoped = (q) => (opts.institution ? q.where('institutionId', '==', opts.institution) : q);
  // Every link, not only those stored under this institution: one saved with the wrong institutionId must still count.
  const [parentSnap, studentSnap, linkSnap] = await Promise.all([
    scoped(db.collection('users').where('role', '==', 'parent')).select('institutionId', 'linkedClassIds').get(),
    scoped(db.collection('users').where('role', '==', 'student')).select('institutionId', 'classId', 'classIds').get(),
    db.collection('student_parents').select('parentId', 'studentId', 'institutionId').get(),
  ]);

  const parentIds = new Set(parentSnap.docs.map((d) => d.id));
  const links = linkSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((l) => !opts.institution || parentIds.has(l.parentId) || l.institutionId === opts.institution);

  const { changes, linkFixes, report } = planParentLists({
    parents: parentSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    students: studentSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    links,
  });

  if (opts.live) {
    const writes = [
      ...changes.map(({ parentId, linkedClassIds }) => [db.collection('users').doc(parentId), { linkedClassIds }]),
      ...linkFixes.map(({ linkId, institutionId }) => [db.collection('student_parents').doc(linkId), { institutionId }]),
    ];
    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      for (const [ref, data] of writes.slice(i, i + BATCH_LIMIT)) batch.update(ref, data);
      await batch.commit();
    }
  }

  console.log('');
  console.log(`Documents read:           ${parentSnap.size + studentSnap.size + linkSnap.size}`);
  console.log(`Parents checked:          ${report.parentsChecked}`);
  console.log(`${opts.live ? 'Updated' : 'Would update'}:             ${report.toChange}`);
  console.log(`Already right:            ${report.alreadyRight}`);
  console.log(`Parents with no children: ${report.noChildren}`);
  console.log(`Links to a missing parent:  ${report.linksToMissingParent}`);
  console.log(`Links to a missing student: ${report.linksToMissingStudent}`);
  console.log(`Links across institutions:  ${report.linksAcrossInstitutions}`);
  console.log(`${opts.live ? 'Links corrected' : 'Links to correct'}:           ${report.linksToCorrect}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
