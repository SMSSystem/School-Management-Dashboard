#!/usr/bin/env node
/**
 * Renames one institution everywhere its name is STORED, so the new name shows up in the
 * login/register dropdowns, the sign-in emails and every generated PDF.
 *
 * Why: the name lives in more than one place. The institution profile page only updates
 * institutions/{id}; the public login directory, the emailed portal name and the report
 * snapshots keep the old text (docs/ISSUES_AND_GAPS.md). Other places read the name live
 * (header, audit log, report builder) and update by themselves.
 *
 * What it changes, for the one matching institution:
 *   1. institutions/{id}.name                        -> --to-name
 *   2. registration_directory/{id}.name (+ updatedAt) -> --to-name (the login/register dropdowns)
 *   3. institutions/{id}/email_settings/config.portalName -> --portal-name (only when passed
 *      and the document exists; the sign-in email subject and body use it)
 *   4. institutions/{id}/reportCards/*.institutionName and
 *      institutions/{id}/progressReports/*.institutionName, where it is exactly --from-name
 *      (every existing snapshot is rewritten, as the owner asked)
 *   5. the same two collections at the top level (legacy flat copies) where institutionId
 *      is this institution and institutionName is exactly --from-name
 * It does NOT touch the institution's logo file, the EmailJS template text or the sender
 * display name in Google Workspace (change those by hand), the slug/id, or the audit log.
 *
 * DRY RUN BY DEFAULT: nothing is written unless you pass --live. Every run prints the
 * project and the counts it found, and writes a log to scripts/logs/ (gitignored).
 * Safe to re-run: an institution already holding the new name is still found, and only
 * documents that still hold the old name are rewritten.
 *
 * Refuses: an invalid or identical name, no match, more than one match (pass
 * --institution-id), and the system documents _placeholder, _platform and master.
 *
 * PILOT SCALE ONLY: the whole `institutions` collection is read once to find the match.
 *
 * Usage:
 *   node scripts/rename-institution.mjs --from-name="GENR8-3D Academy" --to-name="GENR8-3D" \
 *     [--portal-name="GENR8-3D Portal"] [--institution-id=<id>] --key=<path> [--live]
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  chunk,
  directoryNeedsUpdate,
  normalizeName,
  pickSnapshotsToUpdate,
  planInstitutionRename,
  portalNeedsUpdate,
} from './renameInstitutionLogic.mjs';

const SNAPSHOT_COLLECTIONS = ['reportCards', 'progressReports'];

function printUsageAndExit(code) {
  console.log(`
Usage:
  node scripts/rename-institution.mjs --from-name=<old> --to-name=<new> [--portal-name=<text>] [--institution-id=<id>] --key=<path> [--live]

  --from-name=<old>        The institution's current name (exact text).
  --to-name=<new>          The new name (1 to 100 characters).
  --portal-name=<text>     Also set email_settings/config.portalName (the name in sign-in emails).
  --institution-id=<id>    Needed only when more than one institution matches.
  --key=<path>             Service-account JSON key (or set GOOGLE_APPLICATION_CREDENTIALS).
  --live                   Actually write. Omit for a dry run (the default).
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { fromName: null, toName: null, portalName: null, institutionId: null, keyPath: null, live: false };
  for (const arg of argv) {
    if (arg === '--live') opts.live = true;
    else if (arg.startsWith('--from-name=')) opts.fromName = arg.slice('--from-name='.length);
    else if (arg.startsWith('--to-name=')) opts.toName = arg.slice('--to-name='.length);
    else if (arg.startsWith('--portal-name=')) opts.portalName = arg.slice('--portal-name='.length);
    else if (arg.startsWith('--institution-id=')) opts.institutionId = arg.slice('--institution-id='.length);
    else if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  if (!opts.fromName || !opts.toName) {
    console.error('Pass --from-name and --to-name.');
    printUsageAndExit(1);
  }
  if (opts.portalName !== null && !normalizeName(opts.portalName)) {
    console.error('--portal-name must be 1 to 100 characters.');
    process.exit(1);
  }
  if (opts.institutionId && !/^[A-Za-z0-9_-]{1,64}$/.test(opts.institutionId)) {
    console.error('--institution-id must be a single Firestore document id.');
    process.exit(1);
  }
  return opts;
}

function writeLog(entry) {
  mkdirSync('scripts/logs', { recursive: true });
  const logPath = `scripts/logs/rename-institution-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(logPath, JSON.stringify(entry, null, 2));
  console.log(`Log: ${logPath}`);
}

/** All documents of a collection (or a filtered query) with their institutionName only. */
async function readSnapshots(source) {
  const snap = await source.select('institutionName').get();
  return snap.docs.map((d) => ({ ref: d.ref, institutionName: d.get('institutionName') }));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const keyPath = opts.keyPath ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath || !existsSync(keyPath)) {
    console.error('A service-account key is required: pass --key=<path> or set GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }
  const key = JSON.parse(readFileSync(keyPath, 'utf8'));
  const app = initializeApp({ credential: cert(key) });
  const db = getFirestore(app);

  console.log(`Mode: ${opts.live ? 'LIVE (will write)' : 'dry run (nothing will be written)'}`);
  console.log(`Project: ${key.project_id}`);
  console.log('');

  const institutionsSnap = await db.collection('institutions').get();
  const institutions = institutionsSnap.docs.map((d) => ({ id: d.id, name: d.get('name') }));
  const plan = planInstitutionRename({
    institutions,
    fromName: opts.fromName,
    toName: opts.toName,
    institutionId: opts.institutionId,
  });
  if (plan.action === 'blocked') {
    console.error(`Refusing: ${plan.reason}.`);
    process.exit(1);
  }

  const { id, from, to } = plan;
  const instRef = db.collection('institutions').doc(id);
  const directoryRef = db.collection('registration_directory').doc(id);
  const settingsRef = instRef.collection('email_settings').doc('config');

  const [directorySnap, settingsSnap] = await Promise.all([directoryRef.get(), settingsRef.get()]);
  const directoryChange = directoryNeedsUpdate(directorySnap.exists ? directorySnap.data() : null, to);
  const portalChange = portalNeedsUpdate(settingsSnap.exists ? settingsSnap.data() : null, opts.portalName);

  const snapshotTargets = [];
  const counts = {};
  for (const name of SNAPSHOT_COLLECTIONS) {
    const nested = pickSnapshotsToUpdate(await readSnapshots(instRef.collection(name)), from);
    const flat = pickSnapshotsToUpdate(
      await readSnapshots(db.collection(name).where('institutionId', '==', id)),
      from,
    );
    counts[`${name} (nested)`] = nested.length;
    counts[`${name} (legacy flat)`] = flat.length;
    snapshotTargets.push(...nested, ...flat);
  }

  console.log(`Institution: ${id}`);
  console.log(`  name now:    "${institutions.find((i) => i.id === id)?.name}"`);
  console.log(`  will become: "${to}"`);
  console.log('');
  console.log('Will do:');
  console.log(`  1. institutions/${id}.name:                       ${plan.nameChange ? 'update' : 'already correct'}`);
  console.log(`  2. registration_directory/${id}.name:             ${
    !directorySnap.exists ? 'no document (skipped)' : directoryChange ? 'update' : 'already correct'
  }`);
  console.log(`  3. email_settings/config.portalName:              ${
    opts.portalName === null
      ? 'not requested (skipped)'
      : !settingsSnap.exists
        ? 'no document (skipped)'
        : portalChange
          ? `update to "${opts.portalName.trim()}"`
          : 'already correct'
  }`);
  let step = 4;
  for (const [label, count] of Object.entries(counts)) {
    console.log(`  ${step}. ${label}: ${count} to rewrite`);
    step += 1;
  }
  console.log('');

  const entry = {
    live: opts.live,
    project: key.project_id,
    institutionId: id,
    from,
    to,
    portalName: opts.portalName === null ? null : opts.portalName.trim(),
    institutionNameChange: plan.nameChange,
    directoryChange,
    portalChange,
    snapshotCounts: counts,
    outcome: opts.live ? 'started' : 'dry-run',
  };

  const nothingToDo =
    !plan.nameChange && !directoryChange && !portalChange && snapshotTargets.length === 0;
  if (nothingToDo) {
    console.log('Everything already holds the new name. Nothing to change.');
    entry.outcome = 'nothing';
    writeLog(entry);
    return;
  }

  if (opts.live) {
    try {
      const head = db.batch();
      if (plan.nameChange) head.update(instRef, { name: to });
      if (directoryChange) head.update(directoryRef, { name: to, updatedAt: FieldValue.serverTimestamp() });
      if (portalChange) head.update(settingsRef, { portalName: opts.portalName.trim() });
      await head.commit();
      entry.headDone = true;
      console.log('  Done: institution, directory and portal name.');

      let done = 0;
      for (const group of chunk(snapshotTargets)) {
        const batch = db.batch();
        for (const target of group) batch.update(target.ref, { institutionName: to });
        await batch.commit();
        done += group.length;
      }
      entry.snapshotsRewritten = done;
      entry.outcome = 'done';
      console.log(`  Done: ${done} report snapshot(s) rewritten.`);
    } catch (err) {
      entry.outcome = 'partial';
      writeLog(entry);
      console.error(`A write FAILED (${err.message}). Some changes are already saved. Run the same command again.`);
      process.exit(1);
    }
    console.log('');
    console.log('By hand: edit the EmailJS template text and the Google Workspace sender display name if they say the old name.');
  }
  console.log('');
  console.log(opts.live ? 'Done.' : 'Dry run only. Run again with --live to make these changes.');
  writeLog(entry);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
