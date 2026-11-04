#!/usr/bin/env node
/**
 * Turns the large-file kill switches on and off (docs/miscellaneous-specs/LESSON_NOTE_12_FILES_SPEC.md section 7).
 * The Realtime Database rules check these flags, so they bind every client. Only the Admin SDK can set them.
 *
 *   reads:   refuses downloads of files over 500KB, for lesson notes and assignments.
 *   writes:  refuses new files over 500KB. Deletes, small files and the orphan sweep keep working.
 *
 * DRY RUN BY DEFAULT: it prints the current state and what it would change, and writes nothing without --apply.
 * Run it from sms-system. Never commit the key.
 *
 * Usage:
 *   node scripts/set-large-files-paused.mjs --key=<path> --project=<id> [--reads on|off] [--writes on|off]
 *        [--database-url=<url>] [--apply]
 */

import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { READS_PATH, WRITES_PATH, describeSwitch, parseArgs, planUpdate } from './setLargeFilesPausedLogic.mjs';

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const serviceAccount = JSON.parse(readFileSync(opts.key, 'utf8'));
  if (serviceAccount.project_id !== opts.project) {
    throw new Error(`Refusing to run: --project is "${opts.project}" but the key belongs to "${serviceAccount.project_id}".`);
  }
  const databaseURL = (opts.databaseUrl ?? `https://${opts.project}-default-rtdb.firebaseio.com`).replace(/\/$/, '');
  const db = getDatabase(initializeApp({ credential: cert(serviceAccount), databaseURL }));

  const show = async (label) => {
    const [reads, writes] = await Promise.all([db.ref(READS_PATH).get(), db.ref(WRITES_PATH).get()]);
    console.log(`${label}: reads ${describeSwitch(reads.val())}, writes ${describeSwitch(writes.val())}`);
  };

  console.log(`Project: ${opts.project}`);
  console.log(`Mode: ${opts.apply ? 'APPLY' : 'dry run (nothing will be changed)'}`);
  await show('Now');

  const update = planUpdate(opts);
  if (Object.keys(update).length === 0) {
    console.log('Nothing asked for. Pass --reads on|off or --writes on|off to change a switch.');
    return;
  }
  for (const [path, value] of Object.entries(update)) console.log(`Would set ${path}: ${describeSwitch(value)}`);
  if (!opts.apply) {
    console.log('Dry run: nothing was changed. Re-run with --apply.');
    return;
  }
  await db.ref().update(update);
  await show('After');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
