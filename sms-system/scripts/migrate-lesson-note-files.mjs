#!/usr/bin/env node
/**
 * One-off migration: gives every existing lesson note that has a file the new
 * "several files per note" fields, so the app lists and downloads its file the
 * same way as a new note's. docs/miscellaneous-specs/LESSON_NOTES_FEATURE_SPEC.md.
 *
 * Before: a note's one file is lessonNotes/{id}/attachment/data, and the note
 * carries attachmentFileName / attachmentMimeType / attachmentSize.
 * After:  the note also carries `attachments: [{ id: 'data', fileName, mimeType,
 * size }]` and `attachmentIds: ['data']`. The file document itself does not move
 * (same id, same body or Realtime Database key), so nothing is copied and no
 * stored file is touched.
 *
 * Idempotent: a note that already has `attachments` is left alone, so it is safe
 * to run again (do, after the app is deployed: a note edited by the old app in
 * between only has the old fields). It never changes `updatedAt`, and never
 * writes a note whose file document is missing (it reports it instead).
 *
 * DRY RUN BY DEFAULT: nothing is written unless you pass --live.
 *
 * --drop-legacy (run LATER, once the app that reads `attachments` is live and
 * everything has been migrated) deletes the old single-file fields from notes that
 * already have `attachments`.
 *
 * Reads: one per lesson note, plus one per note that needs migrating (its file
 * document, whose body is read too). Writes: one per migrated note. Every run
 * (dry or live) writes a log under scripts/logs/ (gitignored): note ids and
 * outcomes, no file names, no personal data.
 *
 * Usage:
 *   node scripts/migrate-lesson-note-files.mjs --key=<path> [--institution=<id>] [--live] [--drop-legacy]
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { LEGACY_FILE_ID, legacyFieldsToDrop, planNoteMigration, tally } from './migrateLessonNoteFilesLogic.mjs';

function printUsageAndExit(code) {
  console.log(`
Usage:
  node scripts/migrate-lesson-note-files.mjs --key=<path> [--institution=<id>] [--live] [--drop-legacy]

  --key=<path>        Service-account JSON key (or set GOOGLE_APPLICATION_CREDENTIALS).
  --institution=<id>  Only this institution's notes (default: every institution).
  --live              Actually write. Omit for a dry run (the default).
  --drop-legacy       Also delete the old single-file fields from notes that already have the new list.
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { keyPath: null, institution: null, live: false, dropLegacy: false };
  for (const arg of argv) {
    if (arg === '--live') opts.live = true;
    else if (arg === '--drop-legacy') opts.dropLegacy = true;
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
  const app = initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
  const db = getFirestore(app);

  console.log(`Mode: ${opts.live ? 'LIVE (will write)' : 'dry run (nothing will be written)'}${opts.dropLegacy ? ', drop-legacy' : ''}`);
  console.log(`Scope: ${opts.institution ? `institution ${opts.institution} only` : 'all institutions'}`);
  console.log('');

  const institutionIds = opts.institution
    ? [opts.institution]
    : (await db.collection('institutions').listDocuments()).map((d) => d.id);

  const log = [];
  const outcomes = [];
  let failed = 0;

  for (const institutionId of institutionIds) {
    const notes = await db.collection('institutions').doc(institutionId).collection('lessonNotes').get();
    console.log(`${institutionId}: ${notes.size} lesson note(s)`);
    for (const noteDoc of notes.docs) {
      const note = noteDoc.data();
      try {
        // Needs the file's metadata only when the note says it has a file and has not been migrated.
        const needsFile = !Array.isArray(note.attachments) && note.hasAttachment === true;
        let legacyFile = null;
        if (needsFile) {
          // Only the metadata fields are read, not the file's body (up to 500KB inline).
          const [fileSnap] = await db.getAll(noteDoc.ref.collection('attachment').doc(LEGACY_FILE_ID), {
            fieldMask: ['fileName', 'mimeType', 'size'],
          });
          legacyFile = fileSnap.exists ? fileSnap.data() : null;
        }
        const plan = planNoteMigration(note, legacyFile);
        outcomes.push(plan.action);
        log.push({ institutionId, noteId: noteDoc.id, action: plan.action, ...(plan.reason ? { reason: plan.reason } : {}) });
        if (plan.action === 'missing-file') {
          console.log(`  REPORT ${noteDoc.id}: ${plan.reason} (not written)`);
        } else if (plan.action === 'migrate') {
          console.log(`  ${opts.live ? 'MIGRATE' : '[dry-run] would migrate'} ${noteDoc.id}`);
          if (opts.live) await noteDoc.ref.update(plan.update);
        }

        if (opts.dropLegacy) {
          // After a live migrate above the note now has the list; the dry run reasons the same way.
          const effective = plan.action === 'migrate' ? { ...note, ...plan.update } : note;
          const drop = legacyFieldsToDrop(effective);
          if (drop.length > 0) {
            outcomes.push('dropLegacy');
            log.push({ institutionId, noteId: noteDoc.id, action: 'dropLegacy', fields: drop });
            console.log(`  ${opts.live ? 'DROP' : '[dry-run] would drop'} ${drop.join(', ')} on ${noteDoc.id}`);
            if (opts.live) {
              await noteDoc.ref.update(Object.fromEntries(drop.map((f) => [f, FieldValue.delete()])));
            }
          }
        }
      } catch (err) {
        failed++;
        log.push({ institutionId, noteId: noteDoc.id, action: 'failed', reason: err.message });
        console.error(`  FAILED ${noteDoc.id}: ${err.message}`);
      }
    }
  }

  const counts = tally(outcomes);
  console.log('');
  console.log(opts.live ? 'Summary:' : 'Dry-run summary:');
  console.log(`  ${opts.live ? 'Migrated' : 'Would migrate'}: ${counts.migrate}`);
  console.log(`  Already migrated: ${counts.already}`);
  console.log(`  No file: ${counts['no-file']}`);
  console.log(`  Missing file (reported, not written): ${counts['missing-file']}`);
  if (opts.dropLegacy) console.log(`  ${opts.live ? 'Legacy fields dropped on' : 'Would drop legacy fields on'}: ${counts.dropLegacy}`);
  console.log(`  Failed: ${failed}`);

  mkdirSync('scripts/logs', { recursive: true });
  const logPath = `scripts/logs/migrate-lesson-note-files-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(logPath, JSON.stringify({ live: opts.live, dropLegacy: opts.dropLegacy, counts, log }, null, 2));
  console.log(`Log: ${logPath}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
