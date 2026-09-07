#!/usr/bin/env node
/**
 * One-time backfill: creates a registration_directory/{institutionId}
 * document for every institution that doesn't already have one — existing
 * institutions created before InstitutionForm.tsx started seeding this at
 * creation time (see LOGIN_SPEC.md §14.1, §13 decision log).
 *
 * Why this is needed: the login page's Institution selector is sourced
 * from registration_directory (fetchAllInstitutions). An institution
 * missing an entry there is invisible to that selector — meaning, once the
 * gated login flow ships, that institution's staff/students would have no
 * way to reach the Email/Password fields at all. This script closes that
 * gap for every institution that predates the creation-time fix.
 *
 * Idempotent — only creates a registration_directory doc where one is
 * missing; never overwrites an existing entry (so an institution that's
 * already toggled registration on, with real activeAcademicYearId/Name
 * data, is left untouched). Safe to re-run.
 *
 * Run locally — this requires a service-account key and is never executed
 * from a coding environment. Never commit the key file (see .gitignore).
 *
 * PILOT SCALE ONLY — not safe above roughly 10k documents in `institutions`
 * as written. The whole collection is loaded into memory in one `.get()`
 * (no `.limit()`/pagination). Fine at current pilot scale; add pagination
 * before reusing this against a much larger dataset.
 *
 * Usage:
 *   node scripts/backfill-registration-directory.mjs [--dry-run] [--key=<path>]
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Manually-created system/sentinel documents that live in `institutions`
// but aren't real schools with staff/students who need to log in — must
// never get a registration_directory entry, since that collection backs
// the public, pre-login Institution dropdown. `_platform` is the
// super_admin platform-level audit-log home (MISCELLANEOUS_INFO.md
// §"institutions/_platform Sentinel Document"); `master` is a reserved,
// currently-unused slot for future platform-wide data
// (FIRESTORE_INSTITUTION_NESTING_SPEC.md §5.4); `_placeholder` is of
// unconfirmed origin but is not a real institution either. Extend this
// list if another sentinel doc is ever added to `institutions`.
const NON_INSTITUTION_IDS = new Set(['_placeholder', '_platform', 'master']);

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/backfill-registration-directory.mjs [--dry-run] [--key=<path>]

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

  console.log(`Mode: backfill registration_directory from institutions${opts.dryRun ? ' [dry-run]' : ''}`);

  const institutionsSnap = await db.collection('institutions').get();
  console.log(`Found ${institutionsSnap.size} institutions.`);

  let created = 0;
  let skipped = 0;
  let skippedSentinel = 0;

  for (const institutionDoc of institutionsSnap.docs) {
    if (NON_INSTITUTION_IDS.has(institutionDoc.id)) {
      console.log(`  SKIP institutions/${institutionDoc.id} — not a real institution (sentinel/reserved doc)`);
      skippedSentinel++;
      continue;
    }

    const directoryRef = db.collection('registration_directory').doc(institutionDoc.id);
    const directorySnap = await directoryRef.get();
    if (directorySnap.exists) {
      skipped++;
      continue;
    }

    const institution = institutionDoc.data();
    const entry = {
      name: institution.name ?? institutionDoc.id,
      logoUrl: institution.logoUrl ?? null,
      acceptingRegistrations: false,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'backfill-registration-directory-script',
    };

    console.log(
      `${opts.dryRun ? '[dry-run] Would create' : 'Creating'} registration_directory/${institutionDoc.id}:`,
      entry,
    );
    if (!opts.dryRun) {
      await directoryRef.set(entry);
    }
    created++;
  }

  console.log(
    `\nDone. ${created} created, ${skipped} already had an entry (untouched), ` +
    `${skippedSentinel} skipped (sentinel/reserved, not a real institution).`,
  );
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
