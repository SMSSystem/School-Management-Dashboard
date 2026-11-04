#!/usr/bin/env node
/**
 * Recounts the active students of every class and stores the result on the class document:
 *   institutions/{id}/classes/{classId}.population         = { male, female, unspecified }
 *   institutions/{id}/classes/{classId}.populationBaseline = server timestamp
 *
 * Why: the Classes list reads each class's head-count from its own document once it has a baseline (otherwise it runs
 * six count() queries per class). The app keeps the numbers current in the batches that change a student
 * (src/lib/classPopulationDelta.ts); this sets the starting numbers, and repairs them if a script that bypasses the
 * app (a seed, an import by script, the class-list backfill) changed students. Run it after the app that can read the
 * stored counts is deployed, and again after any such script.
 *
 * DRY RUN BY DEFAULT: nothing is written unless you pass --live. Every run (dry or live) writes a log of the counts
 * per class (class names and numbers, no personal data) to scripts/logs/ (gitignored).
 *
 * Reads: every student of each institution once (their classes, gender and status are tallied in memory) and the
 * institution's classes. Writes: one update per class whose numbers differ, in batches of 400.
 *
 * Usage:
 *   node scripts/recount-class-populations.mjs --key=<path> [--institution=<id>] [--live]
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { planRecount, tallyPopulation } from './recountClassPopulationLogic.mjs';
import { usageExit, requireKeyPath } from './adminCli.mjs';

const BATCH = 400;

const printUsageAndExit = usageExit(`
Usage:
  node scripts/recount-class-populations.mjs --key=<path> [--institution=<id>] [--live]

  --key=<path>        Service-account JSON key (or set GOOGLE_APPLICATION_CREDENTIALS).
  --institution=<id>  Only this institution (default: every institution).
  --live              Actually write the counts. Omit for a dry run (the default).
`);

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
  const keyPath = requireKeyPath(opts.keyPath);
  const db = getFirestore(initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) }));

  console.log(`Mode: ${opts.live ? 'LIVE (will write)' : 'dry run (nothing will be written)'}`);
  console.log(`Scope: ${opts.institution ? `institution ${opts.institution} only` : 'all institutions'}`);
  console.log('');

  const institutionIds = opts.institution
    ? [opts.institution]
    : (await db.collection('institutions').listDocuments()).map((d) => d.id);

  const log = [];
  let changedTotal = 0;
  let written = 0;
  let failed = 0;

  for (const institutionId of institutionIds) {
    const classSnap = await db.collection('institutions').doc(institutionId).collection('classes').get();
    if (classSnap.empty) continue;
    const studentSnap = await db
      .collection('users')
      .where('institutionId', '==', institutionId)
      .where('role', '==', 'student')
      .get();
    const students = studentSnap.docs.map((d) => ({
      classId: d.get('classId'),
      classIds: d.get('classIds'),
      gender: d.get('gender'),
      status: d.get('status'),
    }));
    const classes = classSnap.docs.map((d) => ({
      id: d.id,
      ref: d.ref,
      name: d.get('name'),
      population: d.get('population'),
      populationBaseline: d.get('populationBaseline'),
    }));
    const rows = planRecount(classes, tallyPopulation(students, classes.map((c) => c.id)));
    const changed = rows.filter((r) => r.changed);
    console.log(`${institutionId}: ${classes.length} class(es), ${students.length} student(s), ${changed.length} to update`);
    for (const r of rows) {
      const c = r.counted;
      const verb = r.changed ? (opts.live ? 'WRITE' : '[dry-run] would write') : 'ok   ';
      const was = r.stored
        ? ` (stored: ${r.stored.male}/${r.stored.female}/${r.stored.unspecified}${r.hadBaseline ? '' : ', no baseline'})`
        : ' (nothing stored)';
      console.log(`  ${verb} ${r.name ?? r.id}: male ${c.male}, female ${c.female}, unspecified ${c.unspecified}${was}`);
      log.push({ institutionId, classId: r.id, className: r.name ?? null, counted: r.counted, stored: r.stored, changed: r.changed });
    }
    changedTotal += changed.length;

    if (opts.live) {
      const refs = new Map(classes.map((c) => [c.id, c.ref]));
      for (let i = 0; i < changed.length; i += BATCH) {
        const batch = db.batch();
        const chunk = changed.slice(i, i + BATCH);
        for (const r of chunk) {
          batch.update(refs.get(r.id), { population: r.counted, populationBaseline: FieldValue.serverTimestamp() });
        }
        try {
          await batch.commit();
          written += chunk.length;
        } catch (err) {
          failed += chunk.length;
          console.error(`  FAILED a batch of ${chunk.length}: ${err.message}`);
        }
      }
    }
  }

  console.log('');
  console.log(opts.live ? 'Summary:' : 'Dry-run summary:');
  console.log(`  Classes needing an update: ${changedTotal}`);
  if (opts.live) {
    console.log(`  Written: ${written}`);
    console.log(`  Failed: ${failed}`);
  }

  mkdirSync('scripts/logs', { recursive: true });
  const logPath = `scripts/logs/recount-class-populations-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(logPath, JSON.stringify({ live: opts.live, changedTotal, written, failed, log }, null, 2));
  console.log(`Log: ${logPath}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
