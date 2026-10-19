#!/usr/bin/env node
/**
 * Sets users/{uid}.hasPhoto on students and teachers that do not have it yet: true when the person has a photo
 * document (users/{uid}/photo), false when they have none.
 *
 * Why: the Students and Teachers lists read each row's photo (one read per person on a page, even for a person with
 * no photo). They now skip the read when the document says hasPhoto === false. The app writes the flag with every
 * photo upload, removal and account creation; this sets it on the accounts from before that. Until it is run, an
 * account with no flag is still read once, so nothing breaks.
 *
 * DRY RUN BY DEFAULT: nothing is written unless you pass --live. Every run (dry or live) writes a log of how many
 * accounts were flagged each way, per institution (counts only, no personal data), to scripts/logs/ (gitignored).
 * Only accounts with no hasPhoto field are touched, so it is safe to re-run.
 *
 * Reads: every student and teacher of each institution once, plus one photo-collection read each for the ones that
 * need the flag. Writes: one update per account that needs it, in batches of 400.
 *
 * Usage:
 *   node scripts/backfill-has-photo.mjs --key=<path> [--institution=<id>] [--live]
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { needsPhotoFlag, planPhotoFlags, ROLES_WITH_PHOTO_LISTS } from './backfillHasPhotoLogic.mjs';

const BATCH = 400;

function printUsageAndExit(code) {
  console.log(`
Usage:
  node scripts/backfill-has-photo.mjs --key=<path> [--institution=<id>] [--live]

  --key=<path>        Service-account JSON key (or set GOOGLE_APPLICATION_CREDENTIALS).
  --institution=<id>  Only this institution (default: every institution).
  --live              Actually write the flags. Omit for a dry run (the default).
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

  console.log(`Mode: ${opts.live ? 'LIVE (will write)' : 'dry run (nothing will be written)'}`);
  console.log(`Scope: ${opts.institution ? `institution ${opts.institution} only` : 'all institutions'}`);
  console.log('');

  const institutionIds = opts.institution
    ? [opts.institution]
    : (await db.collection('institutions').listDocuments()).map((d) => d.id);

  const log = [];
  let planned = 0;
  let written = 0;
  let failed = 0;

  for (const institutionId of institutionIds) {
    const snap = await db
      .collection('users')
      .where('institutionId', '==', institutionId)
      .where('role', 'in', ROLES_WITH_PHOTO_LISTS)
      .get();
    const users = snap.docs.map((d) => ({ id: d.id, ref: d.ref, role: d.get('role'), hasPhoto: d.get('hasPhoto') }));
    const need = users.filter(needsPhotoFlag);
    if (need.length === 0) continue;

    const photoUids = new Set();
    for (let i = 0; i < need.length; i += 20) {
      await Promise.all(
        need.slice(i, i + 20).map(async (u) => {
          const photo = await u.ref.collection('photo').limit(1).get();
          if (!photo.empty) photoUids.add(u.id);
        }),
      );
    }
    const plan = planPhotoFlags(users, photoUids);
    const withPhoto = plan.filter((p) => p.hasPhoto).length;
    console.log(
      `${institutionId}: ${users.length} account(s), ${plan.length} need the flag (${withPhoto} with a photo, ${plan.length - withPhoto} without)`,
    );
    log.push({ institutionId, accounts: users.length, flagged: plan.length, withPhoto, withoutPhoto: plan.length - withPhoto });
    planned += plan.length;

    if (opts.live) {
      const refs = new Map(users.map((u) => [u.id, u.ref]));
      for (let i = 0; i < plan.length; i += BATCH) {
        const batch = db.batch();
        const chunk = plan.slice(i, i + BATCH);
        for (const p of chunk) batch.update(refs.get(p.id), { hasPhoto: p.hasPhoto });
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
  console.log(`  Accounts needing the flag: ${planned}`);
  if (opts.live) {
    console.log(`  Written: ${written}`);
    console.log(`  Failed: ${failed}`);
  }

  mkdirSync('scripts/logs', { recursive: true });
  const logPath = `scripts/logs/backfill-has-photo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(logPath, JSON.stringify({ live: opts.live, planned, written, failed, log }, null, 2));
  console.log(`Log: ${logPath}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
